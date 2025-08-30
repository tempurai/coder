import { ReActAgent } from '../agents/react_agent/ReActAgent.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { Config } from '../config/ConfigLoader.js';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { ISnapshotManagerFactory } from '../di/interfaces.js';
import { UIEventEmitter, TaskStartedEvent, TaskCompletedEvent, SnapshotCreatedEvent } from '../events/index.js';
import { ToolAgent } from '../agents/tool_agent/ToolAgent.js';

export interface TaskExecutionResult {
    success: boolean;
    taskDescription: string;
    duration: number;
    iterations: number;
    summary: string;
    snapshotId?: string;
    error?: string;
}

export interface ProcessedInput {
    originalInput: string;
    extractedFilePaths: string[];
    hasFileReferences: boolean;
    timestamp: Date;
    inputLength: number;
    wordCount: number;
}

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

export interface SessionStats {
    totalInteractions: number;
    totalTokensUsed: number;
    averageResponseTime: number;
    uniqueFilesAccessed: number;
    watchedFilesCount: number;
    sessionDuration: number;
    loopDetectionStats: any; // 简化类型
    snapshotStats: {
        totalSnapshots: number;
        latestSnapshot?: string;
        shadowRepoExists: boolean;
    };
}

@injectable()
export class SessionService {
    private sessionHistory: SessionHistoryItem[] = [];
    private sessionStartTime: Date;
    private uniqueFilesAccessed: Set<string> = new Set();
    private totalTokensUsed: number = 0;
    private totalResponseTime: number = 0;
    private interactionCount: number = 0;

    constructor(
        @inject(TYPES.ToolAgent) private _agent: ToolAgent,
        @inject(TYPES.FileWatcherService) private fileWatcherService: FileWatcherService,
        @inject(TYPES.Config) private config: Config,
        @inject(TYPES.SnapshotManagerFactory) private createSnapshotManager: ISnapshotManagerFactory,
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter
    ) {
        this.sessionStartTime = new Date();
        console.log('✅ 会话管理服务已初始化（新版ReAct模式）');
    }

    get agent(): ToolAgent {
        return this._agent;
    }

    get events(): UIEventEmitter {
        return this.eventEmitter;
    }

    async processTask(query: string): Promise<TaskExecutionResult> {
        const startTime = Date.now();
        console.log('\n🚀 开始处理任务...');
        console.log(`📝 任务描述: ${query.substring(0, 80)}${query.length > 80 ? '...' : ''}`);

        this.eventEmitter.emit<TaskStartedEvent>({
            type: 'task_started',
            description: query,
            workingDirectory: process.cwd(),
        });

        try {
            const snapshotManager = await this.createSnapshotManager(process.cwd());
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

            this.eventEmitter.emit<SnapshotCreatedEvent>({
                type: 'snapshot_created',
                snapshotId: snapshotResult.snapshotId!,
                description: snapshotResult.description!,
                filesCount: snapshotResult.filesCount || 0,
            });

            // 直接创建 ReActAgent 实例，不再使用工厂
            const reactAgent = new ReActAgent(this._agent, this.eventEmitter);

            console.log('🔄 开始ReAct推理循环...');
            const taskResult = await reactAgent.runTask(query);

            const finalResult: TaskExecutionResult = {
                success: taskResult.success,
                taskDescription: query,
                duration: taskResult.duration,
                iterations: taskResult.iterations,
                summary: taskResult.summary,
                snapshotId: snapshotResult.snapshotId,
                error: taskResult.error
            };

            this.interactionCount++;
            this.totalResponseTime += finalResult.duration;

            this.addToHistory('user', query);
            this.addToHistory('assistant', finalResult.summary, {
                duration: finalResult.duration,
                tokenCount: this.estimateTokenCount(finalResult.summary)
            });

            const duration = Date.now() - startTime;
            console.log(`\n✅ 任务处理完成: ${finalResult.success ? '成功' : '失败'} (${duration}ms)`);

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
        const loopStats = this._agent.getLoopDetectionStats();
        const sessionDuration = Date.now() - this.sessionStartTime.getTime();
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
            sessionDuration: Math.round(sessionDuration / 1000),
            loopDetectionStats: loopStats,
            snapshotStats: {
                totalSnapshots: snapshotStatus.snapshotCount,
                latestSnapshot: snapshotStatus.latestSnapshot?.id,
                shadowRepoExists: snapshotStatus.shadowRepoExists
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
        this.sessionHistory = [];
        this.uniqueFilesAccessed.clear();
        this.totalTokensUsed = 0;
        this.totalResponseTime = 0;
        this.interactionCount = 0;
        this.sessionStartTime = new Date();
        this._agent.clearLoopDetectionHistory();
        console.log('✨ 会话历史和状态已清除');
    }

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

        if (this.sessionHistory.length > 100) {
            this.sessionHistory = this.sessionHistory.slice(-100);
        }
    }

    private estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    // ... 其他辅助方法保持不变 ...
    async cleanup(): Promise<void> {
        this.fileWatcherService.cleanup();
        await this._agent.cleanup();
        console.log('✅ 会话服务资源已清理');
    }
}