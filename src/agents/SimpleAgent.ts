import { Agent } from '@mastra/core';
import { Config } from '../config/ConfigLoader';
import type { LanguageModel } from 'ai';
import { LoopDetectionService, LoopDetectionResult } from '../services/LoopDetectionService';
import { SimpleProjectContextProvider } from '../context/SimpleProjectContextProvider';
import * as path from 'path';

// Agent流可以产出的事件类型
export type AgentStreamEvent = 
  | { type: 'text-chunk'; content: string }
  | { type: 'tool-call'; toolName: string; toolInput: Record<string, any> }
  | { type: 'tool-result'; toolName: string; result: any; warning?: string }
  | { type: 'error'; content: string };

// 增强工具集
import { shellExecutorTool, multiCommandTool } from '../tools/ShellExecutor';
// Git工作流工具集
import { gitWorkflowTools } from '../tools/GitWorkflowTools';
// 简化的文件工具集
import { simpleFileTools } from '../tools/SimpleFileTools';
// Web工具集
import { webSearchTool, urlFetchTool } from '../tools/WebTools';
// MCP工具集
import { loadMcpTools, mcpToolLoader, McpTool } from '../tools/McpToolLoader';
// 传统工具(后备)
import { findFilesTool, searchInFilesTool } from '../tools/FileTools';
import { gitStatusTool, gitLogTool, gitDiffTool } from '../tools/GitTools';
import { findFunctionsTool, findImportsTool, getProjectStructureTool, analyzeCodeStructureTool } from '../tools/CodeTools';

/**
 * 可配置工具接口
 */
interface ConfigurableTool {
  id: string;
  name: string;
  description: string;
  parameters: any;
  execute: (params: any) => Promise<any>;
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

export class SimpleAgent {
    private agent: Agent;
    private config: Config;
    private model: LanguageModel;
    private mcpTools: McpTool[] = [];
    private mcpStatus: McpStatus = { isLoaded: false, toolCount: 0, connectionCount: 0, tools: [] };
    private loopDetector: LoopDetectionService;
    private simpleContextProvider: SimpleProjectContextProvider;

    /**
     * 初始化SimpleAgent
     * @param config 应用配置对象
     * @param model 语言模型实例
     * @param customContext 可选的用户自定义上下文（向后兼容）
     */
    constructor(
        config: Config, 
        model: LanguageModel, 
        customContext?: string
    ) {
        this.config = config;
        this.model = model;
        
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
        
        // 立即创建带有所有内置工具的Agent - 消除双重初始化
        this.agent = this.createAgentWithBuiltinTools(customContext);
        
        // 异步加载MCP工具，但不依赖Agent创建
        this.loadMcpToolsAsync();
    }

    /**
     * 异步初始化方法（向后兼容，现在主要用于等待MCP工具加载完成）
     * @param customContext 可选的用户自定义上下文
     * @deprecated 不再需要调用此方法，Agent已在构造函数中完全初始化
     */
    async initializeAsync(customContext?: string): Promise<void> {
        // 等待MCP工具加载完成（如果正在进行中）
        await this.waitForMcpTools();
        console.log('✅ 异步初始化完成（向后兼容）');
    }

    /**
     * 创建带有内置工具的Agent（单次初始化核心方法）
     * @param customContext 用户自定义上下文
     * @returns Agent实例
     */
    private createAgentWithBuiltinTools(customContext?: string): Agent {
        try {
            const instructions = this.buildSystemInstructionsSync(customContext);
            return new Agent({
                name: 'EnhancedCodeAssistant',
                instructions,
                model: this.model as any, 
                tools: this.getBuiltinTools(),
            });
        } catch (error) {
            console.warn('⚠️ 创建Agent时发生错误，使用基础配置:', error instanceof Error ? error.message : '未知错误');
            // 回退到最基础的Agent
            return new Agent({
                name: 'TempuraiAgent',
                instructions: 'Code assistant (basic mode)',
                model: this.model as any,
                tools: {}
            });
        }
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
     * 动态添加工具到现有Agent（核心扩展方法）
     * @param tools 要添加的工具映射
     */
    addToolsToAgent(tools: Record<string, any>): void {
        try {
            // 获取当前Agent的工具集
            const currentTools = (this.agent as any).tools || {};
            
            // 合并新工具
            const mergedTools = { ...currentTools, ...tools };
            
            // 更新Agent的工具集（直接修改内部属性）
            (this.agent as any).tools = mergedTools;
            
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
     * 获取所有内置工具
     * @returns 内置工具对象
     */
    private getBuiltinTools(): Record<string, any> {
        return {
            // 🚀 GIT WORKFLOW TOOLS (PRIMARY)
            start_task: gitWorkflowTools.start_task,
            commit_changes: gitWorkflowTools.commit_changes,
            end_task: gitWorkflowTools.end_task,
            discard_task: gitWorkflowTools.discard_task,
            get_workflow_status: gitWorkflowTools.get_workflow_status,
            
            // 📝 SIMPLE FILE TOOLS
            write_file: simpleFileTools.write_file,
            amend_file: simpleFileTools.amend_file,
            read_file: simpleFileTools.read_file,
            
            // 🌐 WEB ACCESS TOOLS
            web_search: webSearchTool,
            url_fetch: urlFetchTool,
            
            // 🔧 SHELL EXECUTION TOOLS  
            shell_executor: this.createConfigurableShellTool(shellExecutorTool),
            multi_command: this.createConfigurableShellTool(multiCommandTool),
            
            // 🔍 CODE ANALYSIS TOOLS
            find_files: findFilesTool,
            search_in_files: searchInFilesTool,
            find_functions: findFunctionsTool,
            find_imports: findImportsTool,
            get_project_structure: getProjectStructureTool,
            analyze_code_structure: analyzeCodeStructureTool,
            
            // 📜 GIT TOOLS (for reference)
            git_status: gitStatusTool,
            git_log: gitLogTool, 
            git_diff: gitDiffTool,
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
        const baseInstructions = `You are a professional software developer AI assistant that works just like a human developer using Git workflows.

${staticProjectContext}

## 🚀 CORE DEVELOPMENT WORKFLOW

You operate as a **Git-Native Developer** - every coding task follows professional Git branch workflows:

### 📋 THE 6-STEP PROCESS:
1. **start_task** → Create feature/fix branch for the work
2. **explore & analyze** → Use read_file, analyze_code_structure, find_functions to understand
3. **code & modify** → Use write_file, amend_file to implement changes
4. **stage & commit** → Use commit_changes with meaningful commit messages
5. **test validation** → Use shell_executor to run tests, builds, lints
6. **end_task** → Merge to main and cleanup, or discard_task if problems

### 🔧 PRIMARY TOOL HIERARCHY:
1. **🚀 Git Workflow Tools** (start_task, commit_changes, end_task, discard_task, get_workflow_status)
2. **📝 Simple File Tools** (write_file, amend_file, read_file)
3. **🔍 Code Analysis Tools** (analyze_code_structure, find_functions, find_imports, get_project_structure)
4. **💻 Shell Execution** (shell_executor, multi_command)
5. **🌐 Web Research** (web_search, url_fetch)

## 🎯 WORKFLOW PRINCIPLES

### ✅ ALWAYS DO:
- Start EVERY coding task with `start_task` - creates your working branch
- Use meaningful branch names (feature/add-auth, fix/memory-leak, refactor/simplify-context)
- Make focused, atomic commits with clear messages
- Run tests/builds before ending tasks
- End with `end_task` to merge and cleanup

### ❌ NEVER DO:
- Modify files on main branch (always work on task branches)
- Skip the Git workflow - it's not optional
- Make commits without meaningful messages
- Leave branches hanging (always end_task or discard_task)

## 🔌 ADVANCED CAPABILITIES

### MCP Plugin System:
Available external tools: ${this.mcpTools.length > 0 ? this.mcpTools.map(tool => `${tool.name} - ${tool.description}`).join('\n- ') : 'Loading...'}

### Internet Research:
- **web_search**: Current information, documentation, solutions
- **url_fetch**: Detailed content analysis from specific URLs
- Always research before implementing to use latest practices

### Code Intelligence:
- **analyze_code_structure**: AST parsing for deep code understanding
- Get function signatures, class structures, imports/exports
- Use before making complex modifications

## 💬 COMMUNICATION STYLE

### When Starting Work:
```
🚀 **Starting Task**: [Brief description]
📝 **Branch**: feature/[descriptive-name]
🎯 **Goal**: [What we're achieving]
```

### During Development:
```
🔍 **Analysis**: [What you discovered]
📝 **Changes**: [What you're modifying]
💾 **Commit**: [Commit message]
```

### When Testing:
```
🧪 **Testing**: [What tests you're running]
✅ **Results**: [Test outcomes]
```

### When Completing:
```
✅ **Task Complete**: [Summary of changes]
🔀 **Merged**: [Branch merged to main]
🧹 **Cleanup**: [Branch deleted]
```

## 📊 CONFIGURATION
- Model: ${this.getModelDisplayName()}
- Temperature: ${this.config.temperature}
- Shell timeout: ${this.config.tools.shellExecutor.defaultTimeout}ms
- Max retries: ${this.config.tools.shellExecutor.maxRetries}
- Web search: ${this.config.tavilyApiKey ? 'Enabled (Tavily)' : 'Disabled (no API key)'}

You are a professional developer. Work professionally, communicate clearly, and always follow the Git workflow. Every task is a new branch, every change is committed, every completion is merged.`;

        // 如果有自定义上下文，添加到指令末尾
        if (customContext && customContext.trim()) {
            return `${baseInstructions}\n\n--- USER-DEFINED CONTEXT ---\n${customContext.trim()}`;
        }
        
        return baseInstructions;
    }

    
    /**
     * 创建可配置的通用工具
     * @param baseTool 基础工具对象
     * @returns 配置化的工具对象
     */
    private createConfigurableTool(baseTool: ConfigurableTool): ConfigurableTool {
        return {
            ...baseTool,
            execute: async (params: any) => {
                return baseTool.execute(params);
            }
        };
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
    
    // 创建可配置的SmartDiff工具
    private createConfigurableSmartDiffTool(baseTool: any) {
        return {
            ...baseTool,
            execute: async (params: any) => {
                // 应用配置中的diff设置
                const configuredParams = {
                    ...params,
                    maxRetries: params.maxRetries || this.config.tools.smartDiff.maxRetries,
                    contextLines: params.contextLines || this.config.tools.smartDiff.contextLines,
                    enableFuzzyMatching: params.enableFuzzyMatching !== undefined ? params.enableFuzzyMatching : this.config.tools.smartDiff.enableFuzzyMatching
                };
                
                return baseTool.execute(configuredParams);
            }
        };
    }
    
    /**
     * 创建带有模型注入的智能字符串替换工具
     * @param baseTool 基础智能字符串替换工具
     * @returns 配置后的工具
     */
    private createSmartStringReplaceTool(baseTool: any) {
        return {
            ...baseTool,
            execute: async (params: any) => {
                // 注入语言模型实例以支持参数修正
                const configuredParams = {
                    ...params,
                    model: this.model // 注入当前的语言模型实例
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
            const response = await this.agent.generate([{
                role: 'user',
                content: query
            }]);
            
            return response.text;
        } catch (error) {
            console.error('Error processing query:', error);
            return `Sorry, I encountered an error while processing your query: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
    
    /**
     * 流式处理用户查询，支持结构化事件输出
     * 使用异步生成器提供实时的结构化事件，包括文本块、工具调用和结果
     * @param query 用户查询字符串
     * @returns AsyncGenerator<AgentStreamEvent, void, unknown> 流式事件输出
     * @example
     * ```typescript
     * const stream = agent.processStream("解释这段代码");
     * for await (const event of stream) {
     *   switch (event.type) {
     *     case 'text-chunk':
     *       console.log(event.content);
     *       break;
     *     case 'tool-call':
     *       console.log(`调用工具: ${event.toolName}`);
     *       break;
     *     case 'tool-result':
     *       console.log(`工具结果: ${event.result}`);
     *       break;
     *     case 'error':
     *       console.error(event.content);
     *       break;
     *   }
     * }
     * ```
     */
    async *processStream(query: string): AsyncGenerator<AgentStreamEvent, void, unknown> {
        try {
            // 验证输入
            if (!query || typeof query !== 'string' || query.trim().length === 0) {
                yield { type: 'error', content: '❌ 错误: 查询内容不能为空' };
                return;
            }

            // 直接使用现有Agent，无需动态上下文

            // 生成回复
            const response = await this.agent.generate([{
                role: 'user',
                content: query.trim()
            }]);

            // 处理工具调用
            if (response.toolCalls && response.toolCalls.length > 0) {
                for (const toolCall of response.toolCalls) {
                    // 发出工具调用事件
                    yield {
                        type: 'tool-call',
                        toolName: toolCall.toolName,
                        toolInput: toolCall.args
                    };

                    try {
                        // 执行工具调用
                        const toolResult = await this.executeToolCall(toolCall);
                        
                        // 检查是否检测到循环
                        if (toolResult.loopDetected) {
                            // 发出循环检测警告事件
                            yield {
                                type: 'error',
                                content: `🔄 循环检测警告: ${toolResult.error}\n\n💡 建议: ${toolResult.suggestion}\n\n⏸️ 执行已暂停，请提供新的指令或确认是否继续。`
                            };
                            
                            // 发出工具结果事件（标记为循环）
                            yield {
                                type: 'tool-result',
                                toolName: toolCall.toolName,
                                result: toolResult,
                                warning: 'loop_detected'
                            };
                        } else {
                            // 正常的工具结果事件
                            yield {
                                type: 'tool-result',
                                toolName: toolCall.toolName,
                                result: toolResult
                            };
                        }
                    } catch (toolError) {
                        // 发出工具执行错误事件
                        yield {
                            type: 'error',
                            content: `工具 ${toolCall.toolName} 执行失败: ${toolError instanceof Error ? toolError.message : '未知错误'}`
                        };
                    }
                }
            }

            // 处理文本响应
            if (response.text) {
                // 流式输出文本块，模拟打字机效果
                const fullResponse = response.text;
                const words = fullResponse.split(' ');
                let currentText = '';

                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    currentText += (i === 0 ? '' : ' ') + word;
                    
                    yield {
                        type: 'text-chunk',
                        content: currentText
                    };
                    
                    // 添加延迟以创造打字机效果
                    // 根据单词长度调整延迟时间
                    const delay = Math.max(20, Math.min(100, word.length * 10));
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // 如果既没有文本响应也没有工具调用
            if (!response.text && (!response.toolCalls || response.toolCalls.length === 0)) {
                yield { type: 'error', content: '❌ 错误: AI回复为空，请稍后重试' };
            }

        } catch (error) {
            const errorMessage = `❌ 处理出错: ${error instanceof Error ? error.message : '未知错误'}`;
            yield { type: 'error', content: errorMessage };
            
            // 如果是网络或API错误，提供一些建议
            if (error instanceof Error) {
                if (error.message.includes('API key') || error.message.includes('unauthorized')) {
                    yield { type: 'error', content: '💡 提示: 请检查您的OpenAI API密钥是否正确配置' };
                } else if (error.message.includes('timeout') || error.message.includes('network')) {
                    yield { type: 'error', content: '💡 提示: 网络连接超时，请检查网络连接或稍后重试' };
                } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
                    yield { type: 'error', content: '💡 提示: API调用频率限制，请稍后重试' };
                }
            }
        }
    }
    
    /**
     * 执行单个工具调用（包含循环检测）
     * @param toolCall 工具调用对象
     * @returns 工具执行结果
     */
    private async executeToolCall(toolCall: any): Promise<any> {
        const toolName = toolCall.toolName;
        const toolArgs = toolCall.args;
        
        // 循环检测 - 在执行前检查
        const loopResult = this.loopDetector.addAndCheck({
            toolName: toolName,
            parameters: toolArgs
        });
        
        if (loopResult.isLoop) {
            // 检测到循环，返回错误而不是执行工具
            const errorMessage = this.buildLoopErrorMessage(loopResult);
            console.warn(`🔄 循环检测警告: ${errorMessage}`);
            
            return {
                success: false,
                error: errorMessage,
                loopDetected: true,
                loopInfo: loopResult,
                suggestion: loopResult.suggestion,
                toolName,
                timestamp: new Date().toISOString()
            };
        }
        
        // 从 agent 的工具集中查找对应工具
        const tool = (this.agent as any).tools?.[toolName];
        
        if (!tool) {
            throw new Error(`未找到工具: ${toolName}`);
        }
        
        try {
            // 执行工具
            const result = await tool.execute(toolArgs);
            
            // 执行成功，记录用于后续分析
            console.log(`🔧 工具执行成功: ${toolName}`);
            
            return result;
        } catch (error) {
            // 工具执行失败
            console.error(`❌ 工具执行失败: ${toolName} - ${error instanceof Error ? error.message : '未知错误'}`);
            throw error;
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
            // 测试基本的API连接
            const testResponse = await this.agent.generate([{
                role: 'user',
                content: 'test'
            }]);
            
            if (testResponse.text) {
                return { 
                    status: 'healthy', 
                    message: `Agent运行正常，使用模型: ${this.config.model}` 
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