import { SmartAgent } from '../agents/smart_agent/SmartAgent.js';
import { FileWatcherService } from './FileWatcherService.js';
import { Config } from '../config/ConfigLoader.js';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { ISnapshotManagerFactory } from '../di/interfaces.js';
import { UIEventEmitter, TaskStartedEvent, TaskCompletedEvent, SnapshotCreatedEvent, TextGeneratedEvent } from '../events/index.js';
import { ToolAgent, Messages } from '../agents/tool_agent/ToolAgent.js';
import { InterruptService } from './InterruptService.js';
import { CompressedAgent } from '../agents/compressed_agent/CompressedAgent.js';

export interface TaskExecutionResult {
    success: boolean;
    summary: string;
    error?: string;
}

export interface SessionStats {
    totalInteractions: number;
    sessionDuration: number;
    snapshotStats: {
        totalSnapshots: number;
        latestSnapshot?: string;
    };
}

@injectable()
export class SessionService {
    private compressedContext: string = '';
    private recentHistory: Messages = [];
    private sessionStartTime: Date;
    private interactionCount: number = 0;
    private messageQueue: string[] = [];
    private isTaskRunning: boolean = false;
    private readonly maxTokens = 30000;
    private readonly preserveRecentCount = 8;
    private compressedAgent: CompressedAgent;

    constructor(
        @inject(TYPES.ToolAgent) private _agent: ToolAgent,
        @inject(TYPES.FileWatcherService) private fileWatcherService: FileWatcherService,
        @inject(TYPES.Config) private config: Config,
        @inject(TYPES.SnapshotManagerFactory) private createSnapshotManager: ISnapshotManagerFactory,
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
        @inject(TYPES.InterruptService) private interruptService: InterruptService
    ) {
        this.sessionStartTime = new Date();
        this.compressedAgent = new CompressedAgent(_agent);
        console.log('✅ 会话管理服务已初始化');
    }

    get agent(): ToolAgent {
        return this._agent;
    }

    get events(): UIEventEmitter {
        return this.eventEmitter;
    }

    async processTask(query: string): Promise<TaskExecutionResult> {
        if (this.isTaskRunning) {
            this.queueMessage(query);
            return {
                success: false,
                summary: 'Task queued - another task is currently running',
                error: 'Another task is already in progress'
            };
        }

        this.isTaskRunning = true;
        this.interruptService.startTask();

        console.log('\n🚀 开始处理任务...');

        // 添加用户输入到最近历史
        this.recentHistory.push({ role: 'user', content: query });

        // 检查是否需要压缩
        await this.compressContextIfNeeded();

        this.eventEmitter.emit({
            type: 'task_started',
            description: query,
            workingDirectory: process.cwd(),
        } as TaskStartedEvent);

        try {
            const snapshotManager = await this.createSnapshotManager(process.cwd());
            console.log('📸 创建任务开始前的快照...');
            const snapshotResult = await snapshotManager.createSnapshot(
                `Pre-task: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`
            );

            if (!snapshotResult.success) {
                console.error('❌ 快照创建失败:', snapshotResult.error);
                const errorMessage = 'Failed to create safety snapshot: ' + snapshotResult.error;

                this.eventEmitter.emit({
                    type: 'text_generated',
                    text: errorMessage,
                } as TextGeneratedEvent);

                return {
                    success: false,
                    summary: errorMessage,
                    error: snapshotResult.error
                };
            }

            console.log(`✅ 安全快照已创建: ${snapshotResult.snapshotId}`);
            this.eventEmitter.emit({
                type: 'snapshot_created',
                snapshotId: snapshotResult.snapshotId!,
                description: snapshotResult.description!,
                filesCount: snapshotResult.filesCount || 0,
            } as SnapshotCreatedEvent);

            const smartAgent = new SmartAgent(this._agent, this.eventEmitter, this.interruptService);
            smartAgent.initializeTools();

            console.log('🔄 开始SmartAgent推理循环...');

            // 构建完整的上下文历史
            const fullHistory = this.buildFullHistory();
            const taskResult = await smartAgent.runTask(query, fullHistory);

            // 添加助手响应到最近历史
            this.recentHistory.push({
                role: 'assistant',
                content: taskResult.finalResult || taskResult.summary
            });

            const finalResult: TaskExecutionResult = {
                success: taskResult.success,
                summary: taskResult.summary,
                error: taskResult.error
            };

            this.interactionCount++;

            console.log(`\n✅ 任务处理完成: ${finalResult.success ? '成功' : '失败'}`);

            this.eventEmitter.emit({
                type: 'task_completed',
                success: finalResult.success,
                duration: taskResult.duration,
                iterations: taskResult.iterations,
                summary: finalResult.summary,
                error: finalResult.error,
            } as TaskCompletedEvent);

            return finalResult;

        } catch (error) {
            const errorMessage = `任务处理出错: ${error instanceof Error ? error.message : '未知错误'}`;
            console.error(`💥 ${errorMessage}`);

            this.eventEmitter.emit({
                type: 'text_generated',
                text: errorMessage,
            } as TextGeneratedEvent);

            return {
                success: false,
                summary: '任务执行时发生严重错误',
                error: errorMessage
            };
        } finally {
            this.isTaskRunning = false;
            this.processNextQueuedMessage();
        }
    }

    private async compressContextIfNeeded(): Promise<void> {
        const totalTokens = this.compressedAgent.calculateTokens(this.recentHistory);

        if (totalTokens <= this.maxTokens || this.recentHistory.length <= this.preserveRecentCount) {
            return;
        }

        // 分离需要压缩的历史和保留的最近历史
        const toCompress = this.recentHistory.slice(0, -this.preserveRecentCount);
        const toKeep = this.recentHistory.slice(-this.preserveRecentCount);

        // 使用CompressedAgent进行压缩
        this.compressedContext = await this.compressedAgent.compress(
            this.compressedContext,
            toCompress
        );

        // 只保留最近的历史
        this.recentHistory = toKeep;
    }

    private buildFullHistory(): Messages {
        const history: Messages = [];

        // 如果有压缩的上下文，添加为系统消息
        if (this.compressedContext) {
            history.push({
                role: 'system',
                content: `[PREVIOUS CONTEXT]\n${this.compressedContext}`
            });
        }

        // 添加最近的历史
        history.push(...this.recentHistory);

        return history;
    }

    async restoreFromSnapshot(snapshotId: string): Promise<{ success: boolean, error?: string }> {
        console.log(`🔄 恢复快照: ${snapshotId}`);
        try {
            const snapshotManager = await this.createSnapshotManager(process.cwd());
            const restoreResult = await snapshotManager.restoreSnapshot(snapshotId);

            if (restoreResult.success) {
                console.log(`✅ 快照恢复成功`);
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

    async getSnapshots() {
        const snapshotManager = await this.createSnapshotManager(process.cwd());
        return await snapshotManager.listSnapshots();
    }

    async getSessionStats(): Promise<SessionStats> {
        const sessionDuration = Date.now() - this.sessionStartTime.getTime();
        const snapshotManager = await this.createSnapshotManager();
        const snapshotStatus = await snapshotManager.getStatus();

        return {
            totalInteractions: this.interactionCount,
            sessionDuration: Math.round(sessionDuration / 1000),
            snapshotStats: {
                totalSnapshots: snapshotStatus.snapshotCount,
                latestSnapshot: snapshotStatus.latestSnapshot?.id,
            }
        };
    }

    getFileWatcherStats(): {
        watchedFileCount: number;
        recentChangesCount: number;
    } {
        return {
            watchedFileCount: this.fileWatcherService.getWatchedFiles().length,
            recentChangesCount: this.fileWatcherService.getBatchedChanges(false).totalChanges,
        };
    }

    clearSession(): void {
        this.compressedContext = '';
        this.recentHistory = [];
        this.interactionCount = 0;
        this.sessionStartTime = new Date();
    }

    interrupt(): void {
        this.interruptService.interrupt();
    }

    isInterrupted(): boolean {
        return this.interruptService.isInterrupted();
    }

    clearInterrupt(): void {
        this.interruptService.reset();
    }

    private queueMessage(query: string): void {
        this.messageQueue.push(query);

        this.eventEmitter.emit({
            type: 'text_generated',
            text: `Task queued: ${this.messageQueue.length} task(s) waiting. Current task: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`,
        } as TextGeneratedEvent);
    }

    private async processNextQueuedMessage(): Promise<void> {
        if (this.messageQueue.length > 0) {
            const nextQuery = this.messageQueue.shift()!;

            setTimeout(() => {
                this.processTask(nextQuery).catch(error => {
                    console.error('Error processing queued task:', error);
                });
            }, 100);
        }
    }

    async cleanup(): Promise<void> {
        this.fileWatcherService.cleanup();
        await this._agent.cleanup();
    }
}