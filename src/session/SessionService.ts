import { SimpleAgent } from '../agents/SimpleAgent.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { Config } from '../config/ConfigLoader.js';
import { ErrorHandler } from '../errors/ErrorHandler.js';
import { IReActAgent, IGitWorkflowManager, IReActAgentFactory, IGitWorkflowManagerFactory } from '../di/interfaces.js';

/**
 * SessionService依赖接口
 */
export interface SessionServiceDependencies {
    agent: SimpleAgent;
    fileWatcher: FileWatcherService;
    config: Config;
    createReActAgent?: IReActAgentFactory;
    createGitWorkflowManager?: IGitWorkflowManagerFactory;
}

/**
 * 任务执行结果接口（新架构）
 */
export interface TaskExecutionResult {
    success: boolean;
    taskDescription: string;
    duration: number;
    iterations: number;
    summary: string;
    diff?: {
        filesChanged: number;
        diffStats: string;
        fullDiff: string;
    };
    error?: string;
}

/**
 * 处理后的用户输入接口
 */
export interface ProcessedInput {
    originalInput: string;
    extractedFilePaths: string[];
    hasFileReferences: boolean;
    timestamp: Date;
    inputLength: number;
    wordCount: number;
}

/**
 * 会话历史项接口
 */
export interface SessionHistoryItem {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: {
        filePaths?: string[];
        duration?: number;
        tokenCount?: number;
    };
}

/**
 * 会话统计信息接口
 */
export interface SessionStats {
    totalInteractions: number;
    totalTokensUsed: number;
    averageResponseTime: number;
    uniqueFilesAccessed: number;
    watchedFilesCount: number;
    sessionDuration: number;
    loopDetectionStats: {
        totalCalls: number;
        uniqueTools: number;
        mostUsedTool: string | null;
        historyLength: number;
    };
    mcpStatus: {
        isLoaded: boolean;
        toolCount: number;
        connectionCount: number;
        tools: string[];
        error?: string;
    };
}

/**
 * 会话管理服务
 * 作为CLI和新两层架构之间的中介层，编排ReActAgent和GitWorkflowManager
 */
export class SessionService {
    private _agent: SimpleAgent;
    private fileWatcherService: FileWatcherService;
    private config: Config;
    private sessionHistory: SessionHistoryItem[] = [];
    private sessionStartTime: Date;
    private uniqueFilesAccessed: Set<string> = new Set();
    private totalTokensUsed: number = 0;
    private totalResponseTime: number = 0;
    private interactionCount: number = 0;

    // 工厂函数，避免直接导入
    private createReActAgent: IReActAgentFactory;
    private createGitWorkflowManager: IGitWorkflowManagerFactory;

    constructor(dependencies: SessionServiceDependencies) {
        this._agent = dependencies.agent;
        this.fileWatcherService = dependencies.fileWatcher;
        this.config = dependencies.config;
        this.sessionStartTime = new Date();

        // 使用工厂函数或延迟加载来避免循环依赖
        this.createReActAgent = dependencies.createReActAgent || this.defaultCreateReActAgent;
        this.createGitWorkflowManager = dependencies.createGitWorkflowManager || this.defaultCreateGitWorkflowManager;

        console.log('✅ 会话管理服务已初始化（依赖注入模式）');
    }

    /**
     * Get the agent instance
     */
    get agent(): SimpleAgent {
        return this._agent;
    }

    /**
     * 处理任务（新架构的核心方法）
     * 编排ReActAgent和GitWorkflowManager的协作
     * @param query 用户任务查询
     * @returns TaskExecutionResult 任务执行结果
     */
    async processTask(query: string): Promise<TaskExecutionResult> {
        const startTime = Date.now();

        console.log('\n🚀 开始处理任务（新架构）...');
        console.log(`📝 任务描述: ${query.substring(0, 80)}${query.length > 80 ? '...' : ''}`);

        try {
            // 第一步：通过工厂函数创建Git工作流管理器
            const gitManager = this.createGitWorkflowManager();

            // 第二步：通过工厂函数创建ReActAgent（使用SimpleAgent作为能力层）
            const reactAgent = this.createReActAgent(this._agent);

            // 第三步：启动Git任务分支
            console.log('🌿 创建任务分支...');
            const startResult = await gitManager.startTask(query);

            if (!startResult.success) {
                return {
                    success: false,
                    taskDescription: query,
                    duration: Date.now() - startTime,
                    iterations: 0,
                    summary: 'Failed to start Git task branch',
                    error: startResult.error
                };
            }

            console.log(`✅ 任务分支已创建: ${startResult.taskBranchName}`);

            // 第四步：执行ReAct任务循环
            console.log('🔄 开始ReAct推理循环...');
            const taskResult = await reactAgent.runTask(query);

            // 第五步：处理任务结果
            let finalResult: TaskExecutionResult;

            if (taskResult.success) {
                // 任务成功完成，生成摘要
                console.log('🏁 生成任务摘要...');
                const endResult = await gitManager.endTask();

                if (endResult.success) {
                    finalResult = {
                        success: true,
                        taskDescription: query,
                        duration: taskResult.duration,
                        iterations: taskResult.iterations,
                        summary: taskResult.summary,
                        diff: {
                            filesChanged: endResult.filesChanged || 0,
                            diffStats: endResult.diffStats || 'No changes',
                            fullDiff: endResult.fullDiff || 'No diff available'
                        }
                    };
                } else {
                    finalResult = {
                        success: true,
                        taskDescription: query,
                        duration: taskResult.duration,
                        iterations: taskResult.iterations,
                        summary: taskResult.summary + ' (Note: Could not generate diff)',
                        error: 'Diff generation failed: ' + endResult.error
                    };
                }
            } else {
                // 任务失败，丢弃任务分支
                console.log('❌ 任务执行失败，丢弃任务分支...');
                const discardResult = await gitManager.discardTask('main', true);

                finalResult = {
                    success: false,
                    taskDescription: query,
                    duration: taskResult.duration,
                    iterations: taskResult.iterations,
                    summary: taskResult.summary,
                    error: taskResult.error
                };

                if (!discardResult.success) {
                    finalResult.error += ` (Additionally, failed to discard branch: ${discardResult.error})`;
                }
            }

            // 更新会话统计
            this.interactionCount++;
            this.totalResponseTime += finalResult.duration;

            // 添加到历史记录
            this.addToHistory('user', query);
            this.addToHistory('assistant', finalResult.summary, {
                duration: finalResult.duration,
                tokenCount: this.estimateTokenCount(finalResult.summary)
            });

            const duration = Date.now() - startTime;
            console.log(`\n✅ 任务处理完成: ${finalResult.success ? '成功' : '失败'} (${duration}ms)`);

            return finalResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = `任务处理出错: ${error instanceof Error ? error.message : '未知错误'}`;

            console.error(`💥 ${errorMessage}`);

            // 尝试清理：丢弃可能创建的任务分支
            try {
                const gitManager = this.createGitWorkflowManager();
                const status = await gitManager.getWorkflowStatus();
                if (status.success && status.isTaskBranch) {
                    console.log('🧹 清理失败的任务分支...');
                    await gitManager.discardTask('main', true);
                }
            } catch (cleanupError) {
                console.warn('⚠️ 清理任务分支失败:', cleanupError);
            }

            return {
                success: false,
                taskDescription: query,
                duration,
                iterations: 0,
                summary: '任务执行时发生严重错误',
                error: errorMessage
            };
        }
    }

    /**
     * 处理用户输入，包括文件引用提取和意图解析（简化版）
     * @param input 原始用户输入
     * @returns 处理后的输入信息
     */
    async processUserInput(input: string): Promise<ProcessedInput> {
        const timestamp = new Date();
        const wordCount = input.split(/\\s+/).filter(word => word.length > 0).length;

        console.log('🔍 正在分析用户输入...');

        // 在新的混合模式下，不再主动提取文件路径
        // Agent将使用其工具动态探索和访问文件
        const extractedFilePaths: string[] = [];
        const hasFileReferences = false;

        // 注意：在混合模式下，我们不再主动提取和监听文件
        // 文件访问将通过Agent工具按需进行
        // if (hasFileReferences) {
        //     console.log(`📄 发现 ${extractedFilePaths.length} 个文件引用: ${extractedFilePaths.join(', ')}`);
        //     extractedFilePaths.forEach(filePath => {
        //         this.uniqueFilesAccessed.add(filePath);
        //     });
        //     await this.manageFileWatching(extractedFilePaths);
        // }

        const processedInput: ProcessedInput = {
            originalInput: input,
            extractedFilePaths,
            hasFileReferences,
            timestamp,
            inputLength: input.length,
            wordCount
        };

        // 添加到会话历史（在混合模式下不包含预提取的文件路径）
        this.addToHistory('user', input);

        return processedInput;
    }

    /**
     * 管理文件监听的添加和移除
     * @param filePaths 需要监听的文件路径数组
     */
    async manageFileWatching(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) {
            try {
                const success = this.fileWatcherService.watchFile(filePath);
                if (success && this.fileWatcherService.isWatching(filePath)) {
                    console.log(`👁️ 开始监听文件变更: ${filePath}`);
                } else {
                    console.warn(`⚠️ 无法监听文件: ${filePath}`);
                }
            } catch (error) {
                console.warn(`⚠️ 文件监听失败 ${filePath}:`, error instanceof Error ? error.message : '未知错误');
            }
        }
    }

    /**
     * 获取会话统计信息
     * @returns 会话统计数据
     */
    getSessionStats(): SessionStats {
        const loopStats = this._agent.getLoopDetectionStats();
        const mcpStatus = this._agent.getMcpStatus();
        const sessionDuration = Date.now() - this.sessionStartTime.getTime();

        return {
            totalInteractions: this.interactionCount,
            totalTokensUsed: this.totalTokensUsed,
            averageResponseTime: this.interactionCount > 0
                ? Math.round(this.totalResponseTime / this.interactionCount)
                : 0,
            uniqueFilesAccessed: this.uniqueFilesAccessed.size,
            watchedFilesCount: this.fileWatcherService.getWatchedFiles().length,
            sessionDuration: Math.round(sessionDuration / 1000), // 转换为秒
            loopDetectionStats: {
                totalCalls: loopStats.totalCalls,
                uniqueTools: loopStats.uniqueTools,
                mostUsedTool: loopStats.mostUsedTool,
                historyLength: loopStats.historyLength
            },
            mcpStatus
        };
    }

    /**
     * 获取会话历史记录
     * @param limit 限制返回的历史项数量
     * @returns 会话历史数组
     */
    getSessionHistory(limit?: number): SessionHistoryItem[] {
        const history = limit ? this.sessionHistory.slice(-limit) : this.sessionHistory;
        return history;
    }

    /**
     * 清除会话历史和相关状态
     */
    clearSession(): void {
        this.sessionHistory = [];
        this.uniqueFilesAccessed.clear();
        this.totalTokensUsed = 0;
        this.totalResponseTime = 0;
        this.interactionCount = 0;
        this.sessionStartTime = new Date();

        // 清除Agent的循环检测历史
        this._agent.clearLoopDetectionHistory();

        console.log('✨ 会话历史和状态已清除');
    }

    /**
     * 获取Agent配置信息
     * @returns Agent配置
     */
    getAgentConfig(): Config {
        return this._agent.getConfig();
    }

    /**
     * 检查Agent健康状态
     * @returns 健康检查结果
     */
    async checkAgentHealth(): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> {
        return await this._agent.healthCheck();
    }

    /**
     * 获取文件监听服务状态
     * @returns 文件监听统计信息
     */
    getFileWatcherStats(): {
        watchedFileCount: number;
        recentChangesCount: number;
        totalChangeEvents: number;
    } {
        return {
            watchedFileCount: this.fileWatcherService.getWatchedFiles().length,
            recentChangesCount: this.fileWatcherService.getRecentChangeEvents().length,
            totalChangeEvents: this.fileWatcherService.getRecentChangeEvents().length // 暂时使用相同值
        };
    }

    /**
     * 停止文件监听
     * @param filePath 要停止监听的文件路径
     */
    stopWatchingFile(filePath: string): void {
        this.fileWatcherService.unwatchFile(filePath);
        console.log(`🚫 已停止监听文件: ${filePath}`);
    }

    /**
     * 停止所有文件监听
     */
    stopAllFileWatching(): void {
        // 获取所有监听的文件并逐个停止
        const watchedFiles = this.fileWatcherService.getWatchedFiles();
        for (const filePath of watchedFiles) {
            this.fileWatcherService.unwatchFile(filePath);
        }
        console.log('🚫 已停止所有文件监听');
    }

    /**
     * 清理资源
     */
    async cleanup(): Promise<void> {
        this.stopAllFileWatching();
        await this._agent.cleanup();
        console.log('✅ 会话服务资源已清理');
    }

    /**
     * 添加到会话历史
     * @param role 角色
     * @param content 内容
     * @param metadata 元数据
     */
    private addToHistory(
        role: 'user' | 'assistant',
        content: string,
        metadata?: {
            filePaths?: string[];
            duration?: number;
            tokenCount?: number;
        }
    ): void {
        this.sessionHistory.push({
            role,
            content,
            timestamp: new Date(),
            metadata
        });

        // 保持历史记录在合理范围内
        if (this.sessionHistory.length > 100) {
            this.sessionHistory = this.sessionHistory.slice(-100);
        }
    }

    /**
     * 估算文本的token数量
     * @param text 文本内容
     * @returns 估算的token数量
     */
    private estimateTokenCount(text: string): number {
        // 简单的token估算：大约4个字符 = 1个token
        // 这是一个粗略估算，实际token化会更复杂
        return Math.ceil(text.length / 4);
    }

    /**
     * 默认的ReActAgent创建工厂（延迟加载避免循环依赖）
     */
    private defaultCreateReActAgent: IReActAgentFactory = (agent: SimpleAgent): IReActAgent => {
        // 延迟导入避免循环依赖
        const { ReActAgent: ReActAgentClass } = require('../agents/ReActAgent');
        return new ReActAgentClass(agent);
    };

    /**
     * 默认的GitWorkflowManager创建工厂（延迟加载避免循环依赖）
     */
    private defaultCreateGitWorkflowManager: IGitWorkflowManagerFactory = (): IGitWorkflowManager => {
        // 延迟导入避免循环依赖
        const { GitWorkflowManager: GitWorkflowManagerClass } = require('../tools/GitWorkflowManager');
        return new GitWorkflowManagerClass();
    };
}