import { SimpleAgent } from '../agents/SimpleAgent.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { Config } from '../config/ConfigLoader.js';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { IReActAgent, IReActAgentFactory, ISnapshotManagerFactory } from '../di/interfaces.js';
import { UIEventEmitter, TaskStartedEvent, TaskCompletedEvent, SnapshotCreatedEvent } from '../events/index.js';

/**
 * 任务执行结果接口（简化版）
 */
export interface TaskExecutionResult {
    success: boolean;
    taskDescription: string;
    duration: number;
    iterations: number;
    summary: string;
    snapshotId?: string;  // 替代diff信息
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
    snapshotStats: {
        totalSnapshots: number;
        latestSnapshot?: string;
        shadowRepoExists: boolean;
    };
}

/**
 * 会话管理服务
 * 作为CLI和新架构之间的中介层，编排ReActAgent和SnapshotManager
 */
@injectable()
export class SessionService {
    private sessionHistory: SessionHistoryItem[] = [];
    private sessionStartTime: Date;
    private uniqueFilesAccessed: Set<string> = new Set();
    private totalTokensUsed: number = 0;
    private totalResponseTime: number = 0;
    private interactionCount: number = 0;

    constructor(
        @inject(TYPES.SimpleAgent) private _agent: SimpleAgent,
        @inject(TYPES.FileWatcherService) private fileWatcherService: FileWatcherService,
        @inject(TYPES.Config) private config: Config,
        @inject(TYPES.SnapshotManagerFactory) private createSnapshotManager: ISnapshotManagerFactory,
        @inject(TYPES.ReActAgentFactory) private createReActAgent: IReActAgentFactory,
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter
    ) {
        this.sessionStartTime = new Date();
        console.log('✅ 会话管理服务已初始化（快照模式）');
    }

    /**
     * Get the agent instance
     */
    get agent(): SimpleAgent {
        return this._agent;
    }

    /**
     * Get the event emitter instance for UI integration
     */
    get events(): UIEventEmitter {
        return this.eventEmitter;
    }

    /**
     * 处理任务（基于快照管理的简化版）
     * @param query 用户任务查询
     * @returns TaskExecutionResult 任务执行结果
     */
    async processTask(query: string): Promise<TaskExecutionResult> {
        const startTime = Date.now();

        console.log('\n🚀 开始处理任务（快照模式）...');
        console.log(`📝 任务描述: ${query.substring(0, 80)}${query.length > 80 ? '...' : ''}`);

        // Emit task started event
        this.eventEmitter.emit<TaskStartedEvent>({
            type: 'task_started',
            description: query,
            workingDirectory: process.cwd(),
        });

        try {
            // 第一步：通过工厂创建SnapshotManager
            const snapshotManager = await this.createSnapshotManager(process.cwd());

            // 第二步：创建安全快照
            console.log('📸 创建任务开始前的快照...');
            const snapshotResult = await snapshotManager.createSnapshot(
                `Pre-task: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`
            );

            if (!snapshotResult.success) {
                console.error('❌ 快照创建失败:', snapshotResult.error);
                return {
                    success: false,
                    taskDescription: query,
                    duration: Date.now() - startTime,
                    iterations: 0,
                    summary: 'Failed to create safety snapshot',
                    error: snapshotResult.error
                };
            }

            console.log(`✅ 安全快照已创建: ${snapshotResult.snapshotId}`);

            // Emit snapshot created event
            this.eventEmitter.emit<SnapshotCreatedEvent>({
                type: 'snapshot_created',
                snapshotId: snapshotResult.snapshotId!,
                description: snapshotResult.description!,
                filesCount: snapshotResult.filesCount || 0,
            });

            // 第二步：通过工厂函数创建ReActAgent
            const reactAgent = await this.createReActAgent(this._agent);

            // 第三步：执行ReAct任务循环
            console.log('🔄 开始ReAct推理循环...');
            const taskResult = await reactAgent.runTask(query);

            // 第四步：构建最终结果
            const finalResult: TaskExecutionResult = {
                success: taskResult.success,
                taskDescription: query,
                duration: taskResult.duration,
                iterations: taskResult.iterations,
                summary: taskResult.summary,
                snapshotId: snapshotResult.snapshotId,
                error: taskResult.error
            };

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

            // Emit task completed event
            this.eventEmitter.emit<TaskCompletedEvent>({
                type: 'task_completed',
                success: finalResult.success,
                duration: finalResult.duration,
                iterations: finalResult.iterations,
                summary: finalResult.summary,
                error: finalResult.error,
            });

            return finalResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = `任务处理出错: ${error instanceof Error ? error.message : '未知错误'}`;

            console.error(`💥 ${errorMessage}`);

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
     * 恢复到指定快照（新增功能）
     * @param snapshotId 快照ID
     * @returns 恢复结果
     */
    async restoreFromSnapshot(snapshotId: string): Promise<{ success: boolean, error?: string }> {
        console.log(`🔄 恢复快照: ${snapshotId}`);

        try {
            const snapshotManager = await this.createSnapshotManager(process.cwd());
            const restoreResult = await snapshotManager.restoreSnapshot(snapshotId);

            if (restoreResult.success) {
                console.log(`✅ 快照恢复成功: ${restoreResult.restoredFiles} 文件已恢复`);
                return { success: true };
            } else {
                return { success: false, error: restoreResult.error };
            }
        } catch (error) {
            const errorMessage = `快照恢复失败: ${error instanceof Error ? error.message : '未知错误'}`;
            console.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * 获取快照列表
     * @returns 快照信息列表
     */
    async getSnapshots() {
        const snapshotManager = await this.createSnapshotManager(process.cwd());
        return await snapshotManager.listSnapshots();
    }

    /**
     * 处理用户输入，包括文件引用提取和意图解析（简化版）
     * @param input 原始用户输入
     * @returns 处理后的输入信息
     */
    async processUserInput(input: string): Promise<ProcessedInput> {
        const timestamp = new Date();
        const wordCount = input.split(/\s+/).filter(word => word.length > 0).length;

        console.log('🔍 正在分析用户输入...');

        // 在快照模式下，不再主动提取文件路径
        // Agent将使用其工具动态探索和访问文件
        const extractedFilePaths: string[] = [];
        const hasFileReferences = false;

        const processedInput: ProcessedInput = {
            originalInput: input,
            extractedFilePaths,
            hasFileReferences,
            timestamp,
            inputLength: input.length,
            wordCount
        };

        // 添加到会话历史
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
    async getSessionStats(): Promise<SessionStats> {
        const loopStats = this._agent.getLoopDetectionStats();
        const mcpStatus = this._agent.getMcpStatus();
        const sessionDuration = Date.now() - this.sessionStartTime.getTime();

        // 获取快照统计
        const snapshotManager = await this.createSnapshotManager();
        const snapshotStatus = await snapshotManager.getStatus();

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
            mcpStatus,
            snapshotStats: {
                totalSnapshots: snapshotStatus.snapshotCount,
                latestSnapshot: snapshotStatus.latestSnapshot?.id,
                shadowRepoExists: snapshotStatus.shadowRepoExists
            }
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
            totalChangeEvents: this.fileWatcherService.getRecentChangeEvents().length
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
        // 注意：SnapshotManager通过工厂创建，不需要在这里清理
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
        return Math.ceil(text.length / 4);
    }

    /**
     * 默认的ReActAgent创建工厂（延迟加载避免循环依赖）
     */
    private defaultCreateReActAgent: IReActAgentFactory = async (agent: SimpleAgent): Promise<IReActAgent> => {
        const { ReActAgent: ReActAgentClass } = await import('../agents/ReActAgent.js');
        throw new Error('ReActAgent factory should be provided via dependency injection');
    };
}