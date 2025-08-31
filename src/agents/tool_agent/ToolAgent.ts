import { generateText, Output } from 'ai';
import { Config, ConfigLoader } from '../../config/ConfigLoader.js';
import type { LanguageModel, ToolSet } from 'ai';
import { injectable, inject } from 'inversify';
import { ZodSchema } from 'zod';
import { TYPES } from '../../di/types.js';

import { createWriteFileTool, createReadFileTool, createApplyPatchTool, createFindFilesTool, createSearchInFilesTool } from '../../tools/SimpleFileTools.js';
import { createShellExecutorTools } from '../../tools/ShellExecutor.js';
import { createWebSearchTool, createUrlFetchTool } from '../../tools/WebTools.js';
import { createGitStatusTool, createGitLogTool, createGitDiffTool } from '../../tools/GitTools.js';
import { createSaveMemoryTool } from '../../tools/MemoryTools.js';
import { loadMCPTools, mcpToolLoader, MCPTool } from '../../tools/McpToolLoader.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { HITLManager } from '../../services/HITLManager.js';

export type Messages = Array<{ role: 'system' | 'user' | 'assistant', content: string }>;

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
    private tools: ToolSet = {};
    private mcpTools: MCPTool[] = [];

    constructor(
        @inject(TYPES.Config) private config: Config,
        @inject(TYPES.LanguageModel) private model: LanguageModel,
        @inject(TYPES.ConfigLoader) private configLoader: ConfigLoader,
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
        @inject(TYPES.HITLManager) private hitlManager: HITLManager
    ) {
    }

    async initializeAsync(): Promise<void> {
        this.loadBuiltinTools();
        await this.loadMcpToolsAsync();
        console.log(`ToolAgent initialized with ${Object.keys(this.tools).length} tools`);
    }

    async generateText({ messages, tools, allowTools = true }: ToolAgentTextProps): Promise<string> {
        const finalMessages = allowTools ? this.addToolInfo(messages) : messages;

        const result = await generateText({
            model: this.model,
            messages: finalMessages,
            tools: {},
            maxOutputTokens: this.config.maxTokens,
            temperature: this.config.temperature,
        });

        return result.text;
    }

    async generateObject<T>({ messages, schema, tools, allowTools = true }: ToolAgentObjectProps<T>): Promise<T> {
        const finalMessages = allowTools ? this.addToolInfo(messages) : messages;

        const result = await generateText({
            model: this.model,
            messages: finalMessages,
            tools: {},
            maxOutputTokens: this.config.maxTokens,
            temperature: this.config.temperature,
            experimental_output: Output.object({ schema }),
        });

        return result.experimental_output;
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
        const toolList = Object.entries(this.tools).map(([name, tool]) =>
            `## ${name}\n${tool.description}\nParameters: ${JSON.stringify(tool.inputSchema, null, 2)}`
        );

        return toolList.length > 0 ? `# Available Tools\n\n${toolList.join('\n\n')}` : '';
    }

    async executeTool(toolName: string, args: any): Promise<any> {
        const tool = this.tools[toolName];
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}. Available tools: ${Object.keys(this.tools).join(', ')}`);
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

    private loadBuiltinTools(): void {
        const tools: ToolSet = {};
        let toolContext = {
            eventEmitter: this.eventEmitter,
            config: this.config,
            configLoader: this.configLoader,
            hitlManager: this.hitlManager
        };

        // File operations
        tools.write_file = createWriteFileTool(toolContext);
        tools.apply_patch = createApplyPatchTool(toolContext);
        tools.read_file = createReadFileTool(toolContext);
        tools.find_files = createFindFilesTool(toolContext);
        tools.search_in_files = createSearchInFilesTool(toolContext);

        // Git operations
        tools.git_status = createGitStatusTool(toolContext);
        tools.git_log = createGitLogTool(toolContext);
        tools.git_diff = createGitDiffTool(toolContext);

        // Web operations
        tools.web_search = createWebSearchTool(toolContext);
        tools.url_fetch = createUrlFetchTool(toolContext);

        // Shell operations
        const shellTools = createShellExecutorTools(toolContext);
        tools.shell_executor = shellTools.execute;
        tools.multi_command = shellTools.multiCommand;

        // Memory operations
        tools.save_memory = createSaveMemoryTool(toolContext);

        this.tools = tools;
    }

    public registerTool(name: string, tool: any): void {
        this.tools[name] = tool;
    }

    private async loadMcpToolsAsync(): Promise<void> {
        try {
            this.mcpTools = await loadMCPTools(this.config);
            console.log(`MCP tools loaded: ${this.mcpTools.length}`);

            if (this.mcpTools.length > 0) {
                const mcpToolsMap = Object.fromEntries(
                    this.mcpTools.map(tool => [tool.name, tool])
                );
                this.tools = { ...this.tools, ...mcpToolsMap };
            }
        } catch (error) {
            console.error('MCP tools loading failed:', error);
        }
    }

    getAvailableTools(): string[] {
        return Object.keys(this.tools);
    }

    async cleanup(): Promise<void> {
        await mcpToolLoader.cleanup();
    }
}