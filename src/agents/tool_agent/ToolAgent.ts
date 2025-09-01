import { generateText, Output } from 'ai';
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

@injectable()
export class ToolAgent {
    private isInitialized = false;

    constructor(
        @inject(TYPES.Config) private config: Config,
        @inject(TYPES.LanguageModel) private model: LanguageModel,
        @inject(TYPES.ToolRegistry) private toolRegistry: ToolRegistry,
        @inject(TYPES.InterruptService) private interruptService: InterruptService
    ) { }

    async initializeAsync(): Promise<void> {
        if (this.isInitialized) return;

        await this.loadAllTools();
        console.log(`ToolAgent initialized with ${this.toolRegistry.getToolNames().length} tools`);
        this.isInitialized = true;
    }

    private async loadAllTools(): Promise<void> {
        // Register built-in tools
        registerShellExecutorTools(this.toolRegistry);
        registerFileTools(this.toolRegistry);
        registerWebTools(this.toolRegistry);
        registerGitTools(this.toolRegistry);
        registerMemoryTools(this.toolRegistry);

        // Register MCP tools
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
        const toolList = Object.entries(tools).map(([name, tool]) =>
            `## ${name}\n${tool.description}\nParameters: ${JSON.stringify(tool.inputSchema, null, 2)}`
        );

        return toolList.length > 0 ? `# Available Tools\n\n${toolList.join('\n\n')}` : '';
    }

    async executeTool(toolName: string, args: any): Promise<any> {
        const tool = this.toolRegistry.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}. Available tools: ${this.toolRegistry.getToolNames().join(', ')}`);
        }

        if (this.interruptService.isInterrupted()) {
            throw new Error('Tool execution interrupted by user');
        }

        try {
            const result = await (tool as any).execute(args);
            console.log(`Tool executed successfully: ${toolName}`);
            return result;
        } catch (error) {
            const errorMessage = `Tool '${toolName}' execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }

    public registerTool(name: string, tool: any): void {
        this.toolRegistry.register({ name, tool });
    }

    getAvailableTools(): string[] {
        return this.toolRegistry.getToolNames();
    }

    async cleanup(): Promise<void> {
        // Cleanup handled by individual tool loaders
    }
}