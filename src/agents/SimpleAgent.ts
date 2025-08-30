import { generateText, tool } from 'ai';
import { Config } from '../config/ConfigLoader.js';
import type { LanguageModel, ToolSet } from 'ai';
import { injectable, inject } from 'inversify';
import { z } from 'zod';
import { TYPES } from '../di/types.js';
import { LoopDetectionService, LoopDetectionResult } from '../services/LoopDetectionService.js';
import { ProgressCallback } from '../events/index.js';
import { SimpleProjectContextProvider } from '../context/SimpleProjectContextProvider.js';

// Agent流可以产出的事件类型
export type AgentStreamEvent =
    | { type: 'text-chunk'; content: string }
    | { type: 'tool-call'; toolName: string; toolInput: Record<string, any> }
    | { type: 'tool-result'; toolName: string; result: any; warning?: string }
    | { type: 'error'; content: string };

// 增强工具集
import { createShellExecutorTool } from '../tools/ShellExecutor.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
// 简化的文件工具集
import { simpleFileTools } from '../tools/SimpleFileTools.js';
// Web工具集
import { createWebSearchTool, createUrlFetchTool } from '../tools/WebTools.js';
// MCP工具集
import { loadMcpTools, mcpToolLoader, McpTool } from '../tools/McpToolLoader.js';
// 传统工具(后备)
import { findFilesTool, searchInFilesTool } from '../tools/FileTools.js';
import { gitStatusTool, gitLogTool, gitDiffTool } from '../tools/GitTools.js';
import { findFunctionsTool, findImportsTool, getProjectStructureTool, analyzeCodeStructureTool } from '../tools/CodeTools.js';

/**
 * 工具初始化状态
 */
interface ToolInitializationStatus {
    builtinLoaded: boolean;
    mcpLoaded: boolean;
    allLoaded: boolean;
    toolCount: number;
    error?: string;
}

/**
 * Agent初始化选项接口
 */
interface AgentInitOptions {
    config: Config;
    model: LanguageModel;
    customContext?: string;
}

/**
 * MCP工具状态接口
 */
interface McpStatus {
    isLoaded: boolean;
    toolCount: number;
    connectionCount: number;
    tools: string[];
    error?: string;
}

@injectable()
export class SimpleAgent {
    private tools: ToolSet = {};
    private systemInstructions: string = '';
    private mcpTools: McpTool[] = [];
    private mcpStatus: McpStatus = { isLoaded: false, toolCount: 0, connectionCount: 0, tools: [] };
    private loopDetector: LoopDetectionService;
    private simpleContextProvider: SimpleProjectContextProvider;
    private initializationStatus: ToolInitializationStatus = {
        builtinLoaded: false,
        mcpLoaded: false,
        allLoaded: false,
        toolCount: 0
    };

    /**
     * 初始化SimpleAgent
     * @param config 应用配置对象
     * @param model 语言模型实例
     * @param customContext 可选的用户自定义上下文（向后兼容）
     */
    constructor(
        @inject(TYPES.Config) private config: Config,
        @inject(TYPES.LanguageModel) private model: LanguageModel
    ) {
        // 初始化循环检测服务
        this.loopDetector = new LoopDetectionService({
            maxHistorySize: 25,
            exactRepeatThreshold: 3,
            alternatingPatternThreshold: 4,
            parameterCycleThreshold: 4,
            timeWindowMs: 60000 // 1分钟窗口
        });

        // 初始化简单项目上下文提供者
        this.simpleContextProvider = new SimpleProjectContextProvider();

        // 不再在构造函数中创建Agent
        // Agent现在在initializeAsync中统一创建
        console.log('🔧 SimpleAgent构造完成，等待异步初始化...');
    }

    /**
     * 异步初始化方法 - 统一工具加载
     * @param customContext 可选的用户自定义上下文
     */
    async initializeAsync(customContext?: string): Promise<void> {
        try {
            console.log('🔄 开始Agent异步初始化...');

            // 1. 先加载内置工具并初始化Agent配置
            this.loadBuiltinTools();
            this.initializeAgentConfiguration(customContext);
            this.initializationStatus.builtinLoaded = true;
            console.log('✅ 内置工具已加载，Agent配置已初始化');

            // 2. 异步加载MCP工具
            await this.loadMcpToolsAsync();
            this.initializationStatus.mcpLoaded = true;
            console.log('✅ MCP工具加载完成');

            // 3. 统计总工具数量
            this.initializationStatus.toolCount = this.getBuiltinToolsCount() + this.mcpTools.length;
            this.initializationStatus.allLoaded = true;

            console.log(`✅ Agent初始化完成 - 共${this.initializationStatus.toolCount}个工具可用`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            console.error('❌ Agent初始化失败:', errorMessage);
            this.initializationStatus.error = errorMessage;

            // 创建最小功能配置作为后备
            if (!this.tools || Object.keys(this.tools).length === 0) {
                this.initializeMinimalAgentConfiguration();
                console.log('🔧 已创建最小功能配置作为后备');
            }

            throw new Error(`Agent initialization failed: ${errorMessage}`);
        }
    }

    /**
     * 加载内置工具（独立方法）
     */
    private loadBuiltinTools(): void {
        console.log('🔄 加载内置工具...');
        // 这里可以添加内置工具的预加载逻辑
        // 目前内置工具是静态的，所以直接标记为已加载
    }

    /**
     * 创建带有内置工具的Agent配置
     * @param customContext 用户自定义上下文
     */
    private initializeAgentConfiguration(customContext?: string): void {
        try {
            this.systemInstructions = this.buildSystemInstructionsSync(customContext);
            this.tools = this.convertToAISdkTools(this.getBuiltinTools());
        } catch (error) {
            console.warn('⚠️ 初始化Agent配置时发生错误:', error instanceof Error ? error.message : '未知错误');
            throw error;
        }
    }

    /**
     * 创建最小功能Agent配置（错误后备）
     */
    private initializeMinimalAgentConfiguration(): void {
        this.systemInstructions = 'You are a code assistant operating in minimal mode.';
        this.tools = {
            finish: tool({
                description: 'Mark the current task as completed',
                inputSchema: z.object({}),
                execute: async () => ({
                    success: true,
                    message: 'Task marked as finished',
                    completed: true
                })
            })
        };
    }

    /**
     * 异步加载MCP工具的后台任务
     */
    private async loadMcpToolsAsync(): Promise<void> {
        try {
            console.log('🔄 开始加载MCP工具...');
            this.mcpStatus = { isLoaded: false, toolCount: 0, connectionCount: 0, tools: [], error: undefined };

            this.mcpTools = await loadMcpTools(this.config);
            console.log(`✅ MCP工具加载完成: ${this.mcpTools.length}个工具`);

            // 动态添加MCP工具到现有Agent
            if (this.mcpTools.length > 0) {
                const mcpToolsMap: Record<string, any> = {};
                for (const mcpTool of this.mcpTools) {
                    mcpToolsMap[mcpTool.name] = mcpTool;
                }
                this.addToolsToAgent(mcpToolsMap);
            }

            // 更新状态
            const connectionStatus = mcpToolLoader.getConnectionStatus();
            this.mcpStatus = {
                isLoaded: true,
                toolCount: this.mcpTools.length,
                connectionCount: connectionStatus.connected,
                tools: this.mcpTools.map(tool => tool.name)
            };

            console.log('✅ MCP工具集成完成');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            console.error('❌ MCP工具加载失败:', errorMessage);

            this.mcpStatus = {
                isLoaded: true, // 标记为已尝试加载
                toolCount: 0,
                connectionCount: 0,
                tools: [],
                error: errorMessage
            };
        }
    }

    /**
     * 动态添加工具（核心扩展方法）
     * @param tools 要添加的工具映射
     */
    addToolsToAgent(tools: Record<string, any>): void {
        try {
            // 转换新工具为AI SDK格式
            const aiSdkTools = this.convertToAISdkTools(tools);

            // 合并新工具
            this.tools = { ...this.tools, ...aiSdkTools };

            const toolNames = Object.keys(tools);
            console.log(`🔧 已动态添加 ${toolNames.length} 个工具: ${toolNames.join(', ')}`);
        } catch (error) {
            console.error('❌ 动态添加工具失败:', error instanceof Error ? error.message : '未知错误');
        }
    }

    /**
     * 等待MCP工具加载完成
     * @param timeoutMs 等待超时时间（毫秒）
     */
    private async waitForMcpTools(timeoutMs: number = 10000): Promise<void> {
        const startTime = Date.now();

        while (!this.mcpStatus.isLoaded && (Date.now() - startTime) < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!this.mcpStatus.isLoaded) {
            console.warn('⚠️ MCP工具加载超时，继续使用内置工具');
        }
    }

    /**
     * 转换传统工具格式为AI SDK工具格式
     * @param legacyTools 传统格式的工具
     * @returns AI SDK格式的工具
     */
    private convertToAISdkTools(legacyTools: Record<string, any>): ToolSet {
        const aisdkTools: ToolSet = {};

        for (const [toolName, legacyTool] of Object.entries(legacyTools)) {
            try {
                // 将传统工具格式转换为AI SDK工具格式
                aisdkTools[toolName] = tool({
                    description: legacyTool.description || `Execute ${toolName}`,
                    inputSchema: this.convertParametersToZodSchema(legacyTool.parameters || {}),
                    execute: async (args) => {
                        if (typeof legacyTool.execute === 'function') {
                            return await legacyTool.execute(args);
                        }
                        return { error: `Tool ${toolName} execution function not found` };
                    }
                });
            } catch (error) {
                console.warn(`⚠️ 转换工具 ${toolName} 失败:`, error);
                // 创建一个简单的后备工具
                aisdkTools[toolName] = tool({
                    description: `Fallback tool for ${toolName}`,
                    inputSchema: z.object({}),
                    execute: async () => ({ error: `Tool ${toolName} conversion failed` })
                });
            }
        }

        return aisdkTools;
    }

    /**
     * 将传统参数格式转换为 Zod Schema
     * @param parameters 传统参数定义
     * @returns Zod Schema
     */
    private convertParametersToZodSchema(parameters: any): z.ZodSchema {
        // 如果参数为空或未定义，返回空对象 schema
        if (!parameters || typeof parameters !== 'object') {
            return z.object({});
        }

        // 如果参数是空对象，返回空对象 schema
        if (Object.keys(parameters).length === 0) {
            return z.object({});
        }

        // 如果已经是 JSON Schema 或 Zod Schema，尝试直接使用
        // 这是一个简单的后备，对于复杂的 schema 可能需要更详细的转换
        try {
            // 对于简单的对象格式，创建一个通用的 record schema
            return z.record(z.string(), z.any());
        } catch (error) {
            console.warn('⚠️ 参数转换失败，使用通用 schema:', error);
            return z.record(z.string(), z.any());
        }
    }

    /**
     * 获取内置工具数量
     */
    private getBuiltinToolsCount(): number {
        return Object.keys(this.getBuiltinTools()).length;
    }

    /**
     * 获取所有内置工具
     * @returns 内置工具对象
     */
    private getBuiltinTools(): Record<string, any> {
        return {
            // 📝 SIMPLE FILE TOOLS
            write_file: simpleFileTools.write_file,
            amend_file: simpleFileTools.amend_file,
            read_file: simpleFileTools.read_file,

            // 🌐 WEB ACCESS TOOLS
            web_search: createWebSearchTool(this.config),
            url_fetch: createUrlFetchTool(this.config),

            // 🔧 SHELL EXECUTION TOOLS  
            shell_executor: this.createConfigurableShellTool(createShellExecutorTool(new ConfigLoader()).execute),
            multi_command: this.createConfigurableShellTool(createShellExecutorTool(new ConfigLoader()).multiCommand),

            // 🔍 CODE ANALYSIS TOOLS
            find_files: findFilesTool,
            search_in_files: searchInFilesTool,
            find_functions: findFunctionsTool,
            find_imports: findImportsTool,
            get_project_structure: getProjectStructureTool,
            analyze_code_structure: analyzeCodeStructureTool,

            // 📜 GIT QUERY TOOLS (for information only)
            git_status: gitStatusTool,
            git_log: gitLogTool,
            git_diff: gitDiffTool,

            // 🏁 TASK COMPLETION
            finish: {
                id: 'finish',
                name: 'Finish Task',
                description: 'Mark the current task as completed',
                parameters: {},
                execute: async () => ({
                    success: true,
                    message: 'Task marked as finished',
                    completed: true
                })
            }
        };
    }

    /**
     * 提取自定义上下文（用于重建时）
     * @returns 自定义上下文字符串
     */
    private extractCustomContext(): string | undefined {
        return this.config.customContext;
    }

    /**
     * 构建带有静态项目上下文的系统指令
     * @param customContext 用户自定义上下文
     * @returns 完整的系统指令字符串
     */
    private buildSystemInstructionsSync(customContext?: string): string {
        // 获取静态项目上下文
        const staticProjectContext = this.simpleContextProvider.getStaticContext();

        // 获取可用工具列表
        const availableTools = Object.keys(this.getBuiltinTools());

        const baseInstructions = `You are a software development assistant with advanced reasoning capabilities.

${staticProjectContext}

## 🎯 YOUR ROLE
You are a **Tool Execution Specialist** operating within a ReAct (Reasoning + Acting) framework. Your job is to:
1. **Reason** about the current situation and what needs to be done
2. **Plan** your approach step by step
3. **Act** by using the appropriate tools
4. **Respond** in the exact XML format specified

## 🔧 AVAILABLE TOOLS
${availableTools.map(tool => `- **${tool}**: Use for ${this.getToolDescription(tool)}`).join('\n')}

## 📋 RESPONSE FORMAT
You MUST respond in this exact XML format. No other format is acceptable:

\`\`\`xml
<response>
  <thought>
    Your detailed reasoning about:
    - What you observed or learned
    - What the current situation requires
    - Why you're choosing the next action
    - Any important considerations or constraints
  </thought>
  <plan>
    <?xml version="1.0" encoding="UTF-8"?>
    <plan>
      <task>Brief description of the overall task</task>
      <status>current_phase (analyzing|planning|implementing|testing|completed)</status>
      <updated>${new Date().toISOString()}</updated>
      <steps>
        <step priority="high">Most urgent next step</step>
        <step priority="medium">Follow-up step</step>
        <step priority="low">Future consideration</step>
      </steps>
      <notes>Important observations, constraints, or decisions</notes>
    </plan>
  </plan>
  <action>
    <tool>exact_tool_name</tool>
    <args>{"param1": "value1", "param2": "value2"}</args>
  </action>
</response>
\`\`\`

## 🎯 TOOL USAGE GUIDELINES

### File Operations
- **read_file**: Get file contents before making changes
- **write_file**: Create new files or completely rewrite existing ones
- **amend_file**: Make targeted changes to existing files

### Code Analysis
- **analyze_code_structure**: Deep AST analysis for complex code understanding
- **find_files**: Locate files by name patterns
- **search_in_files**: Find specific text across multiple files

### Development Operations
- **shell_executor**: Run commands, tests, builds, installs
- **git_status**: Check current repository state
- **git_diff**: View changes before committing

### Research & Information
- **web_search**: Find current information, documentation, solutions
- **url_fetch**: Get detailed content from specific web pages

### Task Completion
- **finish**: Use when the task is fully completed and tested

## 🎯 REASONING PRINCIPLES

1. **Observe First**: Always understand the current state before acting
2. **Plan Iteratively**: Your plan should evolve as you learn more
3. **Think Before Tools**: Explain your reasoning before choosing tools
4. **Validate Results**: Check that your actions achieved the intended effect
5. **Handle Errors**: If a tool fails, adapt your approach

## 📊 CONFIGURATION
- Model: ${this.getModelDisplayName()}
- Temperature: ${this.config.temperature}
- Web search: ${this.config.tavilyApiKey ? 'Available (Tavily)' : 'Not available'}
- MCP Tools: ${this.mcpTools.length} external tools loaded

You are an intelligent reasoning agent. Think carefully, plan thoughtfully, and execute precisely.`;

        // 如果有自定义上下文，添加到指令末尾
        if (customContext && customContext.trim()) {
            return `${baseInstructions}\n\n## 📋 ADDITIONAL CONTEXT\n${customContext.trim()}`;
        }

        return baseInstructions;
    }


    /**
     * 获取工具描述
     * @param toolName 工具名称
     * @returns 工具的简短描述
     */
    private getToolDescription(toolName: string): string {
        const descriptions: Record<string, string> = {
            // 文件操作工具
            'write_file': 'creating new files or completely rewriting existing ones',
            'amend_file': 'making targeted changes to existing files',
            'read_file': 'reading file contents',

            // 代码分析工具
            'analyze_code_structure': 'deep AST analysis of JavaScript/TypeScript code',
            'find_files': 'locating files by name patterns',
            'search_in_files': 'searching for specific text across multiple files',
            'find_functions': 'finding function definitions in the codebase',
            'find_imports': 'finding import statements for specific modules',
            'get_project_structure': 'getting the directory structure of the project',

            // Shell执行工具
            'shell_executor': 'executing shell commands, running tests, builds, installs',
            'multi_command': 'executing multiple shell commands in sequence',

            // Git查询工具
            'git_status': 'checking current Git repository status',
            'git_log': 'viewing Git commit history',
            'git_diff': 'showing changes between commits or files',

            // Web工具
            'web_search': 'searching the internet for current information',
            'url_fetch': 'fetching content from specific web URLs',

            // 任务控制
            'finish': 'completing the current task successfully'
        };

        return descriptions[toolName] || 'general development tasks';
    }

    /**
     * 检查Agent是否已初始化
     */
    private ensureAgentInitialized(): void {
        if (!this.tools || Object.keys(this.tools).length === 0) {
            throw new Error('Agent tools not initialized. Call initializeAsync() first.');
        }
        if (!this.systemInstructions) {
            throw new Error('Agent system instructions not initialized. Call initializeAsync() first.');
        }
    }

    /**
     * 获取初始化状态
     */
    public getInitializationStatus(): ToolInitializationStatus {
        return { ...this.initializationStatus };
    }

    // 创建可配置的Shell工具
    private createConfigurableShellTool(baseTool: any) {
        return {
            ...baseTool,
            execute: async (params: any) => {
                // 应用配置中的超时设置
                const configuredParams = {
                    ...params,
                    timeout: params.timeout || this.config.tools.shellExecutor.defaultTimeout,
                    maxRetries: params.maxRetries || this.config.tools.shellExecutor.maxRetries
                };

                return baseTool.execute(configuredParams);
            }
        };
    }

    /**
     * 获取模型显示名称
     * @returns 模型的显示名称
     */
    private getModelDisplayName(): string {
        if (typeof this.config.model === 'string') {
            return this.config.model;
        }
        return `${this.config.model.provider}:${this.config.model.name}`;
    }

    // 标准处理方法
    async process(query: string): Promise<string> {
        try {
            this.ensureAgentInitialized();

            const result = await generateText({
                model: this.model,
                system: this.systemInstructions,
                prompt: query,
                tools: this.tools,
                maxOutputTokens: this.config.maxTokens,
                temperature: this.config.temperature
            });

            return result.text;
        } catch (error) {
            console.error('Error processing query:', error);
            return `Sorry, I encountered an error while processing your query: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }


    /**
     * 生成响应（新的核心方法，供ReActAgent调用）
     * 简化的LLM调用，专注于单次文本生成
     * @param prompt 输入提示词
     * @returns Promise<string> 生成的响应文本
     */
    async generateResponse(prompt: string): Promise<string> {
        try {
            this.ensureAgentInitialized();

            const result = await generateText({
                model: this.model,
                system: this.systemInstructions,
                prompt: prompt,
                tools: this.tools,
                maxOutputTokens: this.config.maxTokens,
                temperature: this.config.temperature
            });

            return result.text || '';
        } catch (error) {
            console.error('Error generating response:', error);
            throw new Error(`LLM generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * 执行单个工具（新的核心方法，供ReActAgent调用）
     * 简化的工具执行引擎，包含循环检测
     * @param toolName 工具名称
     * @param args 工具参数
     * @param progressCallback 可选的进度回调
     * @returns Promise<any> 工具执行结果
     */
    async executeTool(toolName: string, args: any, progressCallback?: ProgressCallback): Promise<any> {
        // 循环检测 - 在执行前检查
        const loopResult = this.loopDetector.addAndCheck({
            toolName: toolName,
            parameters: args
        });

        if (loopResult.isLoop) {
            // 检测到循环，返回错误而不是执行工具
            const errorMessage = this.buildLoopErrorMessage(loopResult);
            console.warn(`🔄 循环检测警告: ${errorMessage}`);

            throw new Error(`Loop detected: ${errorMessage}. Suggestion: ${loopResult.suggestion}`);
        }

        this.ensureAgentInitialized();

        // 从工具集中查找对应工具
        const tool = this.tools[toolName];

        if (!tool) {
            throw new Error(`Tool not found: ${toolName}. Available tools: ${Object.keys(this.tools).join(', ')}`);
        }

        try {
            // 执行工具 - AI SDK工具有不同的执行模式
            // 我们需要直接调用工具的execute函数，因为AI SDK工具包装后的格式
            const result = await (tool as any).execute(args, progressCallback);

            // 执行成功，记录用于后续分析
            console.log(`🔧 工具执行成功: ${toolName}`);

            return result;
        } catch (error) {
            // 工具执行失败
            const errorMessage = `Tool '${toolName}' execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(`❌ ${errorMessage}`);
            throw new Error(errorMessage);
        }
    }

    /**
     * 构建循环检测错误消息
     * @param loopResult 循环检测结果
     * @returns 格式化的错误消息
     */
    private buildLoopErrorMessage(loopResult: LoopDetectionResult): string {
        const baseMessage = `循环检测: ${loopResult.description}`;

        switch (loopResult.loopType) {
            case 'exact_repeat':
                return `${baseMessage}。这可能表明当前操作无效或存在逻辑错误。`;
            case 'alternating_pattern':
                return `${baseMessage}。两个操作可能相互冲突或产生不一致的结果。`;
            case 'parameter_cycle':
                return `${baseMessage}。参数变化可能无法达到预期效果。`;
            case 'tool_sequence':
                return `${baseMessage}。当前方法可能无法解决问题。`;
            default:
                return baseMessage;
        }
    }

    /**
     * 获取循环检测统计信息
     * @returns 循环检测器的统计信息
     */
    public getLoopDetectionStats(): {
        totalCalls: number;
        uniqueTools: number;
        recentTimespan: number;
        mostUsedTool: string | null;
        historyLength: number;
    } {
        const stats = this.loopDetector.getStats();
        return {
            ...stats,
            historyLength: this.loopDetector.getHistory().length
        };
    }

    /**
     * 清除循环检测历史
     * 用于开始新的会话或重置状态
     */
    public clearLoopDetectionHistory(): void {
        this.loopDetector.clearHistory();
        console.log('🔄 循环检测历史已清除');
    }

    /**
     * 更新循环检测配置
     * @param config 新的配置选项
     */
    public updateLoopDetectionConfig(config: Partial<any>): void {
        this.loopDetector.updateConfig(config);
        console.log('⚙️ 循环检测配置已更新');
    }

    /**
     * 获取 MCP 工具状态（更新版本）
     * @returns MCP 工具状态信息
     */
    getMcpStatus(): McpStatus {
        return { ...this.mcpStatus };
    }

    /**
     * 获取详细的MCP状态信息（向后兼容）
     * @returns 详细的MCP状态信息
     */
    getMcpStatusDetailed(): { toolCount: number; connectionCount: number; tools: string[]; isLoaded: boolean; error?: string } {
        const connectionStatus = mcpToolLoader.getConnectionStatus();
        return {
            toolCount: this.mcpTools.length,
            connectionCount: connectionStatus.connected,
            tools: this.mcpTools.map(tool => tool.name),
            isLoaded: this.mcpStatus.isLoaded,
            error: this.mcpStatus.error
        };
    }

    /**
     * 清理资源
     */
    async cleanup(): Promise<void> {
        await mcpToolLoader.cleanup();
    }

    // 获取当前配置
    getConfig(): Config {
        return this.config;
    }

    // 更新配置
    updateConfig(newConfig: Config): void {
        this.config = newConfig;
        // 这里可以重新初始化agent，但为了简单起见，我们只更新配置对象
        // 实际使用中，可能需要重新创建agent实例
    }

    // 健康检查
    async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> {
        try {
            if (!this.tools || Object.keys(this.tools).length === 0) {
                return {
                    status: 'unhealthy',
                    message: 'Agent工具未初始化'
                };
            }

            if (!this.systemInstructions) {
                return {
                    status: 'unhealthy',
                    message: 'Agent系统指令未初始化'
                };
            }

            // 测试基本的API连接
            const testResult = await generateText({
                model: this.model,
                prompt: 'test',
                maxOutputTokens: 10,
                temperature: 0
            });

            if (testResult.text) {
                return {
                    status: 'healthy',
                    message: `Agent运行正常，使用模型: ${this.getModelDisplayName()}，工具数量: ${Object.keys(this.tools).length}`
                };
            } else {
                return {
                    status: 'unhealthy',
                    message: 'Agent响应为空'
                };
            }
        } catch (error) {
            return {
                status: 'unhealthy',
                message: `Agent连接失败: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
}