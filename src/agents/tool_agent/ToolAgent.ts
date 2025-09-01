import { generateObject, generateText, isToolOrDynamicToolUIPart, Output } from 'ai';
import { Config } from '../../config/ConfigLoader.js';
import type { LanguageModel, ToolSet } from 'ai';
import { injectable, inject } from 'inversify';
import { ZodSchema } from 'zod';
import { TYPES } from '../../di/types.js';
import { ToolRegistry } from '../../tools/ToolRegistry.js';
import { registerShellExecutorTools } from '../../tools/ShellExecutor.js';
import { registerFileTools } from '../../tools/SimpleFileTools.js';
import { registerWebTools } from '../../tools/WebTools.js';
import { registerGitTools } from '../../tools/GitTools.js';
import { registerMemoryTools } from '../../tools/MemoryTools.js';
import { registerMcpTools } from '../../tools/McpToolLoader.js';
import { InterruptService } from '../../services/InterruptService.js';
import { ToolExecutionCompletedEvent } from '../../events/EventTypes.js';
import { Logger } from '../../utils/Logger.js';
import { zodToJsonSchema } from "zod-to-json-schema";

export type Message = { role: 'system' | 'user' | 'assistant', content: string };
export type Messages = Message[];

export interface TaskExecutionMetadata {
    createdAt?: number;
    duration?: number;
    iterations?: number;
}

export type TerminateReason = 'FINISHED' | 'ERROR' | 'TIMEOUT' | 'INTERRUPTED' | 'WAITING_FOR_USER';

export interface TaskExecutionResult {
    terminateReason: TerminateReason;
    history: Messages;
    error?: string;
    metadata?: TaskExecutionMetadata
}

export interface ToolAgentTextProps {
    messages: Messages;
    tools?: ToolSet;
    allowTools?: boolean;
}

export interface ToolAgentObjectProps<T> {
    messages: Messages;
    schema: ZodSchema<T>;
    tools?: ToolSet;
    allowTools?: boolean;
}

const generateToolExecutionId = (toolName: string): string => {
    return `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

@injectable()
export class ToolAgent {
    private isInitialized = false;

    constructor(
        @inject(TYPES.Config) private config: Config,
        @inject(TYPES.LanguageModel) private model: LanguageModel,
        @inject(TYPES.ToolRegistry) private toolRegistry: ToolRegistry,
        @inject(TYPES.InterruptService) private interruptService: InterruptService,
        @inject(TYPES.Logger) private logger: Logger
    ) { }

    async initializeAsync(): Promise<void> {
        if (this.isInitialized) return;
        this.logger.info('Initializing ToolAgent', {}, 'AGENT');
        await this.loadAllTools();
        console.log(`ToolAgent initialized with ${this.toolRegistry.getToolNames().length} tools`);
        this.logger.info('ToolAgent initialized', {
            toolCount: this.toolRegistry.getToolNames().length,
            tools: this.toolRegistry.getToolNames()
        }, 'AGENT');
        this.isInitialized = true;
    }

    private async loadAllTools(): Promise<void> {
        registerShellExecutorTools(this.toolRegistry);
        registerFileTools(this.toolRegistry);
        registerWebTools(this.toolRegistry);
        registerGitTools(this.toolRegistry);
        registerMemoryTools(this.toolRegistry);
        await registerMcpTools(this.toolRegistry, this.config);
    }

    async generateText({ messages, tools, allowTools = true }: ToolAgentTextProps): Promise<string> {
        const finalMessages = allowTools ? this.addToolInfo(messages) : messages;
        const abortSignal = this.interruptService.getAbortSignal();

        try {
            const result = await generateText({
                model: this.model,
                messages: finalMessages,
                tools: {},
                maxOutputTokens: this.config.maxTokens,
                temperature: this.config.temperature,
                abortSignal,
            });

            return result.text;
        } catch (error) {
            if (error instanceof Error && (error.name === 'AbortError' || this.interruptService.isInterrupted())) {
                throw new Error('AI request interrupted by user');
            }
            throw error;
        }
    }

    async generateObject<T>({ messages, schema, tools, allowTools = true }: ToolAgentObjectProps<T>): Promise<T> {
        const finalMessages = allowTools ? this.addToolInfo(messages) : messages;
        const abortSignal = this.interruptService.getAbortSignal();

        try {
            const result = await generateText({
                model: this.model,
                messages: finalMessages,
                tools: {},
                maxOutputTokens: this.config.maxTokens,
                temperature: this.config.temperature,
                experimental_output: Output.object({ schema }),
                abortSignal,
            });

            return result.experimental_output;
        } catch (error) {
            if (error instanceof Error && (error.name === 'AbortError' || this.interruptService.isInterrupted())) {
                throw new Error('AI request interrupted by user');
            }
            throw error;
        }
    }

    private addToolInfo(messages: Messages): Messages {
        const toolInfo = this.buildToolInfo();
        if (!toolInfo) return messages;

        const systemMessage = messages[0];
        if (systemMessage?.role === 'system') {
            return [
                { ...systemMessage, content: `${systemMessage.content}\n\n${toolInfo}` },
                ...messages.slice(1)
            ];
        }

        return [{ role: 'system', content: toolInfo }, ...messages];
    }

    private buildToolInfo(): string {
        const tools = this.toolRegistry.getAll();
        let out = "";
        for (const [name, tool] of Object.entries(tools)) {
            const json = zodToJsonSchema(tool.inputSchema as any) as any;
            const required: string[] = json.required || [];
            out += `name: ${name}\n`;
            out += `desc: ${tool.description || "(no description)"}\n`;
            out += "params:\n";

            const props = json.properties || {};
            if (Object.keys(props).length === 0) {
                out += "  - (none)\n\n";
                continue;
            }

            for (const [k, v] of Object.entries<any>(props)) {
                if (/toolExecutionId/i.test(k)) continue;
                const typ = v.type || (Array.isArray(v.enum) ? `enum{${v.enum.join(",")}}` : "any");
                const desc = v.description || "";
                const opt = required.includes(k) ? "" : "optional";
                const def = v.default !== undefined ? `default: ${v.default}` : "";
                const meta = [def, opt].filter(Boolean).join(", ");
                out += `  - ${k}: ${typ} — ${desc}${meta ? " (" + meta + ")" : ""}\n`;
            }
            out += "\n";
        }

        console.log("tool info", out)
        return out.trim();
    }

    async executeTool(toolName: string, args: any): Promise<any> {
        const tool = this.toolRegistry.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}. Available tools: ${this.toolRegistry.getToolNames().join(', ')}`);
        }

        if (this.interruptService.isInterrupted()) {
            throw new Error('Tool execution interrupted by user');
        }

        const toolExecutionId = generateToolExecutionId(toolName);
        const argsWithId = { ...args, toolExecutionId };
        const startTime = Date.now();

        try {
            const result = await (tool as any).execute(argsWithId);
            const duration = Date.now() - startTime;

            this.toolRegistry.getContext().eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName,
                success: !result?.error,
                error: result?.error,
                result: result?.result,
                duration,
                toolExecutionId,
                displayDetails: result?.displayDetails || result?.error,
            } as ToolExecutionCompletedEvent);

            if (result?.error) {
                throw new Error(result.error);
            }

            console.log(`Tool executed successfully: ${toolName}`);
            return result?.result || result;

        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // 外层异常捕获
            this.toolRegistry.getContext().eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName,
                success: false,
                error: errorMessage,
                duration,
                toolExecutionId,
                displayDetails: errorMessage,
            } as ToolExecutionCompletedEvent);

            console.error(`Tool '${toolName}' execution failed: ${errorMessage}`);
            throw error;
        }
    }

    public registerTool(name: string, tool: any): void {
        this.toolRegistry.register({ name, tool });
    }

    getAvailableTools(): string[] {
        return this.toolRegistry.getToolNames();
    }

    async cleanup(): Promise<void> {
        // Cleanup logic if needed
    }
}