import { generateText, tool } from 'ai';
import { Config, ConfigLoader } from '../../config/ConfigLoader.js';
import type { LanguageModel, ToolSet } from 'ai';
import { injectable, inject } from 'inversify';
import { z } from 'zod';
import { TYPES } from '../../di/types.js';
import { LoopDetectionService, LoopDetectionResult } from '../../services/LoopDetectionService.js';

// Agent流可以产出的事件类型
export type AgentStreamEvent =
    | { type: 'text-chunk'; content: string }
    | { type: 'tool-call'; toolName: string; toolInput: Record<string, any> }
    | { type: 'tool-result'; toolName: string; result: any; warning?: string }
    | { type: 'error'; content: string };

// 直接导入具体工具，无需中间转换层
import { createShellExecutorTool } from '../../tools/ShellExecutor.js';
// 文件工具
import { writeFileTool, applyPatchTool, readFileTool, findFilesTool, searchInFilesTool } from '../../tools/SimpleFileTools.js';
// Web工具
import { createWebSearchTool, createUrlFetchTool } from '../../tools/WebTools.js';
// MCP工具集
import { loadMCPTools, mcpToolLoader, MCPTool } from '../../tools/McpToolLoader.js';
// Git工具
import { gitStatusTool, gitLogTool, gitDiffTool } from '../../tools/GitTools.js';
// 代码分析工具
import { findFunctionsTool, findImportsTool, getProjectStructureTool, analyzeCodeStructureTool } from '../../tools/CodeTools.js';
// Memory工具
import { saveMemoryTool } from '../../tools/MemoryTools.js';


@injectable()
export class ToolAgent {
    private tools: ToolSet = {};
    private mcpTools: MCPTool[] = [];
    private loopDetector: LoopDetectionService;

    constructor(
        @inject(TYPES.Config) private config: Config,
        @inject(TYPES.LanguageModel) private model: LanguageModel,
        @inject(TYPES.ConfigLoader) private configLoader: ConfigLoader
    ) {
        this.loopDetector = new LoopDetectionService({
            maxHistorySize: 25,
            exactRepeatThreshold: 5,
            alternatingPatternThreshold: 4,
            parameterCycleThreshold: 4,
            enableSemanticDetection: false,
            timeWindowMs: 60000
        });

        console.log('ToolAgent initialized');
    }

    async initializeAsync(): Promise<void> {
        try {
            this.loadBuiltinTools();
            await this.loadMcpToolsAsync();
            console.log(`ToolAgent initialized with ${Object.keys(this.tools).length} tools`);
        } catch (error) {
            console.error('ToolAgent initialization failed:', error);
            throw error;
        }
    }

    /**
     * 使用自定义system prompt生成响应
     */
    async generateResponse(messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>): Promise<string> {
        const result = await generateText({
            model: this.model,
            messages: messages,
            tools: this.tools,
            maxOutputTokens: this.config.maxTokens,
            temperature: this.config.temperature
        });

        return result.text || '';
    }

    /**
     * 执行工具
     */
    async executeTool(toolName: string, args: any): Promise<any> {
        const loopResult = this.loopDetector.addAndCheck({
            toolName: toolName,
            parameters: args
        });

        if (loopResult.isLoop) {
            const errorMessage = `Loop detected: ${loopResult.description}. Suggestion: ${loopResult.suggestion}`;
            console.warn(`Loop detection warning: ${errorMessage}`);
            throw new Error(errorMessage);
        }

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

        // File operations
        tools.write_file = writeFileTool;
        tools.apply_patch = applyPatchTool;
        tools.read_file = readFileTool;
        tools.find_files = findFilesTool;
        tools.search_in_files = searchInFilesTool;

        // Code analysis
        tools.find_functions = findFunctionsTool;
        tools.find_imports = findImportsTool;
        tools.get_project_structure = getProjectStructureTool;
        tools.analyze_code_structure = analyzeCodeStructureTool;

        // Git tools
        tools.git_status = gitStatusTool;
        tools.git_log = gitLogTool;
        tools.git_diff = gitDiffTool;

        // Web tools
        tools.web_search = createWebSearchTool(this.config);
        tools.url_fetch = createUrlFetchTool(this.config);

        // Shell tools
        const shellTools = createShellExecutorTool(this.configLoader);
        tools.shell_executor = shellTools.execute;
        tools.multi_command = shellTools.multiCommand;

        // Memory tools
        tools.save_memory = saveMemoryTool;

        // Finish tool
        tools.finish = tool({
            description: 'Mark the current task as completed',
            inputSchema: z.object({}),
            execute: async () => ({
                success: true,
                message: 'Task marked as finished',
                completed: true
            })
        });

        this.tools = tools;
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

    clearLoopDetectionHistory(): void {
        this.loopDetector.clearHistory();
    }

    getLoopDetectionStats() {
        return this.loopDetector.getStats();
    }

    async cleanup(): Promise<void> {
        await mcpToolLoader.cleanup();
    }
}