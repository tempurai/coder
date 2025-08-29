import { Agent } from '@mastra/core';
import { Config } from '../config/ConfigLoader';
import type { LanguageModel } from 'ai';
import { LoopDetectionService, LoopDetectionResult } from '../services/LoopDetectionService';
import { ContextManager } from '../context/ContextManager';

// Agent流可以产出的事件类型
export type AgentStreamEvent = 
  | { type: 'text-chunk'; content: string }
  | { type: 'tool-call'; toolName: string; toolInput: Record<string, any> }
  | { type: 'tool-result'; toolName: string; result: any; warning?: string }
  | { type: 'error'; content: string };

// 增强工具集
import { shellExecutorTool, multiCommandTool } from '../tools/ShellExecutor';
import { smartDiffApplyTool, generateDiffTool, validateCodeTool } from '../tools/SmartDiffEngine';
import { enhancedWriteTools, previewChangesTool } from '../tools/EnhancedWriteTools';
// Web 工具集
import { webSearchTool, urlFetchTool } from '../tools/WebTools';
// MCP 工具集
import { loadMcpTools, mcpToolLoader, McpTool } from '../tools/McpToolLoader';
// 传统工具(后备)
import { findFilesTool, searchInFilesTool } from '../tools/FileTools';
import { gitStatusTool, gitLogTool, gitDiffTool } from '../tools/GitTools';
import { findFunctionsTool, findImportsTool, getProjectStructureTool } from '../tools/CodeTools';

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

export class SimpleAgent {
    private agent: Agent;
    private config: Config;
    private model: LanguageModel;
    private mcpTools: McpTool[] = [];
    private loopDetector: LoopDetectionService;
    private contextManager: ContextManager;

    /**
     * 初始化SimpleAgent
     * @param config 应用配置对象
     * @param model 语言模型实例
     * @param contextManager 上下文管理器实例
     * @param customContext 可选的用户自定义上下文（向后兼容）
     */
    constructor(
        config: Config, 
        model: LanguageModel, 
        contextManager: ContextManager, 
        customContext?: string
    ) {
        this.config = config;
        this.model = model;
        this.contextManager = contextManager;
        
        // 初始化循环检测服务
        this.loopDetector = new LoopDetectionService({
            maxHistorySize: 25,
            exactRepeatThreshold: 3,
            alternatingPatternThreshold: 4,
            parameterCycleThreshold: 4,
            timeWindowMs: 60000 // 1分钟窗口
        });
        
        // 创建一个临时的 agent，真正的 agent 将在 initializeAsync 中创建
        this.agent = new Agent({
            name: 'TempuraiAgent',
            instructions: 'Initializing...',
            model: this.model as any,
            tools: {}
        });
        
        // 异步初始化将在稍后调用
        this.initializeAsync(customContext);
    }

    /**
     * 异步初始化 Agent、MCP 工具和其他异步资源
     * @param customContext 可选的用户自定义上下文
     */
    async initializeAsync(customContext?: string): Promise<void> {
        try {
            console.log('🔄 正在初始化异步资源...');
            
            // 首先创建基础 agent
            this.agent = await this.createBaseAgent(customContext);
            console.log('✅ 基础 Agent 初始化完成');
            
            // 加载 MCP 工具
            this.mcpTools = await loadMcpTools(this.config);
            console.log(`✅ MCP 工具加载完成: ${this.mcpTools.length} 个工具`);
            
            // 如果有 MCP 工具，重新创建包含所有工具的 agent
            if (this.mcpTools.length > 0) {
                this.agent = await this.createAgentWithAllTools(customContext);
                console.log('✅ 完整 Agent（包含 MCP 工具）初始化完成');
            }
            
            console.log('✅ 异步初始化完成');
        } catch (error) {
            console.error('❌ 异步初始化失败:', error instanceof Error ? error.message : '未知错误');
            // 继续使用基础 agent，不阻塞启动
        }
    }

    /**
     * 创建基础 agent（不包含 MCP 工具）
     * @param customContext 用户自定义上下文
     * @returns Agent 实例
     */
    private async createBaseAgent(customContext?: string): Promise<Agent> {
        const instructions = await this.buildSystemInstructions(customContext);
        return new Agent({
            name: 'EnhancedCodeAssistant',
            instructions,
            model: this.model as any, 
            tools: this.getBuiltinTools(),
        });
    }

    /**
     * 创建包含所有工具（内置 + MCP）的 agent
     * @param customContext 用户自定义上下文
     * @returns Agent 实例
     */
    private async createAgentWithAllTools(customContext?: string): Promise<Agent> {
        const instructions = await this.buildSystemInstructions(customContext);
        const builtinTools = this.getBuiltinTools();
        const allTools = { ...builtinTools };

        // 添加 MCP 工具
        for (const mcpTool of this.mcpTools) {
            allTools[mcpTool.name] = mcpTool;
        }

        return new Agent({
            name: 'EnhancedCodeAssistant',
            instructions,
            model: this.model as any, 
            tools: allTools,
        });
    }

    /**
     * 获取所有内置工具
     * @returns 内置工具对象
     */
    private getBuiltinTools(): Record<string, any> {
        return {
            // 🎆 ENHANCED PRIMARY TOOLS
            enhanced_write: this.createConfigurableTool(enhancedWriteTools.enhanced_write),
            preview_changes: enhancedWriteTools.preview_changes,
            smart_string_replace: this.createSmartStringReplaceTool(enhancedWriteTools.smart_string_replace),
            
            // 🌐 WEB ACCESS TOOLS
            web_search: webSearchTool,
            url_fetch: urlFetchTool,
            
            // 🔧 CORE EXECUTION TOOLS  
            shell_executor: this.createConfigurableShellTool(shellExecutorTool),
            multi_command: this.createConfigurableShellTool(multiCommandTool),
            
            // ⚙️ DIFF AND VALIDATION TOOLS
            smart_diff_apply: this.createConfigurableSmartDiffTool(smartDiffApplyTool),
            generate_diff: generateDiffTool,
            validate_code: validateCodeTool,
            
            // 🛡️ FALLBACK TOOLS
            find_files: findFilesTool,
            search_in_files: searchInFilesTool,
            
            // 📜 LEGACY TOOLS (minimal usage)
            git_status: gitStatusTool,
            git_log: gitLogTool, 
            git_diff: gitDiffTool,
            find_functions: findFunctionsTool,
            find_imports: findImportsTool,
            get_project_structure: getProjectStructureTool,
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
     * 构建系统指令（异步版本，支持动态上下文）
     * @param customContext 用户自定义上下文
     * @returns 完整的系统指令字符串
     */
    private async buildSystemInstructions(customContext?: string): Promise<string> {
        const baseInstructions = `You are an enhanced ReAct (Reason + Act) code assistant with advanced file modification and internet access capabilities.
        
        ## 🔥 ENHANCED FEATURES
        - **Preview-First Approach**: ALWAYS show changes before applying
        - **Interactive Confirmation**: Wait for user approval before file modifications
        - **Checkpoint System**: Create backups before dangerous operations
        - **Enhanced Diff Display**: Beautiful, colored diff output
        - **Dual Write Modes**: diff mode for targeted changes, direct mode for full replacements
        - **Internet Access**: Real-time web search and content fetching capabilities
        - **Plugin System**: Dynamic MCP tool loading for unlimited extensibility
        - **Context Awareness**: Dynamic project and environment context through pluggable providers
        
        ## 🔌 MCP PLUGIN SYSTEM
        You have access to dynamically loaded external tools via the Model Context Protocol (MCP):
        
        **Available MCP Tools**: ${this.mcpTools.length > 0 ? this.mcpTools.map(tool => `${tool.name} - ${tool.description}`).join('\n        - ') : 'None configured'}
        
        **MCP Tool Usage Guidelines**:
        - MCP tools extend your capabilities beyond built-in functions
        - Each MCP tool may have unique parameters and behaviors
        - Use MCP tools when built-in tools don't meet specific needs
        - MCP tools are executed remotely and may have different performance characteristics
        
        **🚀 Dynamic Capabilities**: Your tool set is not fixed! Users can add new MCP servers to dynamically expand your abilities without code changes.
        
        ## 🌐 INTERNET ACCESS CAPABILITIES
        When you need to get current information, verify facts, or research topics:
        
        **🔍 web_search tool**: Use when you need to:
        - Get real-time information about current events
        - Look up latest documentation or API changes
        - Research new technologies, frameworks, or libraries
        - Verify facts you're uncertain about
        - Find solutions to specific problems
        
        **📄 url_fetch tool**: Use when you need to:
        - Read the full content of a specific webpage
        - Extract detailed information from documentation
        - Analyze blog posts, articles, or GitHub issues
        - Get complete context from links found via web_search
        
        **Usage Guidelines:**
        - Always search for current information rather than relying on potentially outdated training data
        - Use web_search first to find relevant sources, then url_fetch for detailed content
        - Be transparent about when you're using internet search vs. your training knowledge
        - Combine web research with your existing programming expertise for comprehensive solutions
        
        ## 📝 FILE MODIFICATION WORKFLOW
        1. **ALWAYS PREVIEW FIRST**: Use 'enhanced_write' with preview=true to show what will change
        2. **FORMAT RESPONSE**: Clearly explain what you're doing and why
        3. **WAIT FOR CONFIRMATION**: Let the CLI handle user confirmation
        4. **NEVER WRITE DIRECTLY**: Never use enhanced_write with preview=false unless explicitly instructed
        
        ## 🎯 TOOL PRIORITY
        1. **PRIMARY**: enhanced_write, preview_changes, smart_string_replace, web_search, url_fetch
        2. **SECONDARY**: shell_executor, read_file, smart_diff_apply
        3. **FALLBACK**: All other tools when needed
        
        ## 📊 RESPONSE FORMAT
        When planning file changes:
        🎯 **Goal**: [What you're trying to achieve]
        📄 **Files affected**: [List of files]
        🔧 **Mode**: diff/direct
        🔍 **Preview**: [Use enhanced_write with preview=true]
        
        When conducting research:
        🌐 **Research**: [What you're looking up]
        🔍 **Search**: [Key terms being searched]
        📄 **Sources**: [URLs or documents being examined]
        
        ## 🚪 CHECKPOINT USAGE
        - Create checkpoints before:
          * Multiple file modifications
          * Risky refactoring operations  
          * Major structural changes
        - Use: checkpoint(action='create', files=[...], description='...')
        
        ## ⚠️ SAFETY RULES
        - NEVER modify files without showing preview first
        - NEVER use write_file for existing files (use enhanced_write)
        - ALWAYS explain your reasoning before taking action
        - CREATE CHECKPOINTS for multi-file operations
        - Web access is automatically secured against private networks
        
        ## 📈 USER CONFIGURATION
        - Model: ${this.getModelDisplayName()}
        - Temperature: ${this.config.temperature}
        - Shell timeout: ${this.config.tools.shellExecutor.defaultTimeout}ms
        - Max retries: ${this.config.tools.shellExecutor.maxRetries}
        - Context lines: ${this.config.tools.smartDiff.contextLines}
        - Web search: ${this.config.tavilyApiKey ? 'Enabled (Tavily)' : 'Disabled (no API key)'}
        
        Be efficient, safe, and user-friendly! Use your internet access capabilities to provide the most current and accurate information.`;

        // 使用 ContextManager 获取动态上下文信息
        let dynamicContext = '';
        try {
            dynamicContext = await this.contextManager.getCombinedContext();
        } catch (error) {
            console.warn('⚠️ Failed to get dynamic context:', error instanceof Error ? error.message : 'Unknown error');
            // 无法获取上下文时的提示信息
            dynamicContext = '项目上下文暂时不可用，但这不影响正常工作。';
        }

        let instructionsWithContext = baseInstructions;
        
        // 添加动态上下文信息
        if (dynamicContext.trim()) {
            instructionsWithContext = `${baseInstructions}

## 🎯 CONTEXTUAL AWARENESS
${dynamicContext}

这些上下文信息可以帮助你：
- 理解项目的当前状态和结构
- 感知开发环境和工具配置
- 了解最近的活动和变化
- 提供更精准、符合项目特点的建议

记住：利用这些上下文信息来提供更准确、更相关的帮助。`;
        }
        
        // 如果有自定义上下文，添加到指令末尾
        if (customContext && customContext.trim()) {
            return `${instructionsWithContext}\n\n--- USER-DEFINED CONTEXT ---\n${customContext.trim()}`;
        }
        
        return instructionsWithContext;
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
     * 获取 MCP 工具状态
     * @returns MCP 工具状态信息
     */
    getMcpStatus(): { toolCount: number; connectionCount: number; tools: string[] } {
        const status = mcpToolLoader.getConnectionStatus();
        return {
            toolCount: this.mcpTools.length,
            connectionCount: status.connected,
            tools: this.mcpTools.map(tool => tool.name)
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