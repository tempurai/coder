import { ToolAgent, Messages } from '../agents/tool_agent/ToolAgent.js';
import { FileWatcherService } from './FileWatcherService.js';
import { Config } from '../config/ConfigLoader.js';
import { UIEventEmitter, TaskStartedEvent, TaskCompletedEvent, SnapshotCreatedEvent, TextGeneratedEvent, UserInputEvent, SystemInfoEvent } from '../events/index.js';
import { SmartAgent } from '../agents/smart_agent/SmartAgent.js';
import { InterruptService } from './InterruptService.js';
import { CompressorService } from './CompressorService.js';
import { TaskExecutionResult } from '../agents/tool_agent/ToolAgent.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { SnapshotResult, SnapshotManager } from './SnapshotManager.js';
import { EditModeManager } from './EditModeManager.js';

export interface SessionStats {
    totalInteractions: number;
    sessionDuration: number;
    snapshotStats: {
        totalSnapshots: number;
        latestSnapshot?: string;
    };
}

export class SessionService {
    private compressedContext: string = '';
    private recentHistory: Messages = [];
    private sessionStartTime: Date;
    private interactionCount: number = 0;
    private messageQueue: string[] = [];
    private isTaskRunning: boolean = false;

    public readonly editModeManager: EditModeManager;

    constructor(
        private _agent: ToolAgent,
        private fileWatcherService: FileWatcherService,
        private config: Config,
        private eventEmitter: UIEventEmitter,
        private interruptService: InterruptService,
        private toolRegistry: ToolRegistry,
        private compressorService: CompressorService,
        editModeManager: EditModeManager,
    ) {
        this.sessionStartTime = new Date();
        this.editModeManager = editModeManager;
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
                terminateReason: 'ERROR',
                history: [],
                error: 'Another task is already in progress'
            };
        }

        this.isTaskRunning = true;
        this.interruptService.startTask();

        console.log('\n🚀 开始处理任务...');
        this.eventEmitter.emit({
            type: 'user_input',
            input: query,
        } as UserInputEvent);

        this.recentHistory.push({ role: 'user', content: query });

        this.eventEmitter.emit({
            type: 'task_started',
            displayTitle: "Task Started",
            description: query,
            workingDirectory: process.cwd(),
        } as TaskStartedEvent);

        let snapshotResult: SnapshotResult | null = null;

        try {
            console.log('创建任务开始前的快照...');
            snapshotResult = await SnapshotManager.createSnapshot(
                `Pre-task: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`
            );

            if (!snapshotResult.success) {
                throw new Error(snapshotResult.error);
            }
        } catch (error: string | any) {
            console.error('快照创建失败:', error);
            this.eventEmitter.emit({
                type: 'system_info',
                level: 'error',
                message: 'Failed to create safety snapshot: ' + error,
            } as SystemInfoEvent);

            return {
                terminateReason: 'ERROR',
                history: [],
                error: error
            };
        }

        console.log(`安全快照已创建: ${snapshotResult!.snapshotId}`);

        try {
            this.eventEmitter.emit({
                type: 'snapshot_created',
                snapshotId: snapshotResult!.snapshotId!,
                description: snapshotResult!.description!,
                filesCount: snapshotResult!.filesCount || 0,
            } as SnapshotCreatedEvent);

            const smartAgent = new SmartAgent(
                this._agent, 
                this.eventEmitter,
                this.interruptService, 
                this.toolRegistry, 
                this.editModeManager,
                this.toolRegistry.getContext().securityEngine
            );
            smartAgent.initializeTools();

            console.log('Try to build history and compress context');
            await this.compressorService.compressContextIfNeeded(this.recentHistory);

            const fullHistory = this.buildFullHistory();

            console.log('🔄 开始SmartAgent推理循环...');
            const taskResult = await smartAgent.runTask(query, fullHistory);

            taskResult.history = taskResult.history.filter(msg => msg.role !== 'system');
            this.recentHistory.push(...taskResult.history);
            this.interactionCount++;

            console.log(`任务处理完成: ${taskResult.terminateReason}`);

            this.eventEmitter.emit({
                type: 'task_completed',
                displayTitle: "Finished",
                success: taskResult.terminateReason === 'FINISHED',
                duration: taskResult.metadata?.duration,
                iterations: taskResult.metadata?.iterations,
                summary: taskResult.terminateReason === 'FINISHED' ? 'Task completed successfully' : 'Task failed',
                error: taskResult.error,
            } as TaskCompletedEvent);

            return taskResult;
        } catch (error) {
            if (snapshotResult?.snapshotId) {
                this.restoreFromSnapshot(snapshotResult.snapshotId);
            }

            const errorMessage = `任务处理出错: ${error instanceof Error ? error.message : '未知错误'}`;
            console.error(`${errorMessage}`);

            this.eventEmitter.emit({
                type: 'system_info',
                level: 'error',
                message: errorMessage,
            } as SystemInfoEvent);

            return {
                terminateReason: 'ERROR',
                history: [],
                error: errorMessage
            };
        } finally {
            this.isTaskRunning = false;
            this.processNextQueuedMessage();
        }
    }

    private buildFullHistory(): Messages {
        const history: Messages = [];

        if (this.compressedContext) {
            history.push({
                role: 'system',
                content: `[PREVIOUS CONTEXT]\n${this.compressedContext}`
            });
        }

        history.push(...this.recentHistory);
        return history;
    }

    async restoreFromSnapshot(snapshotId: string): Promise<{ success: boolean, error?: string }> {
        console.log(`🔄 恢复快照: ${snapshotId}`);
        try {
            const restoreResult = await SnapshotManager.restoreSnapshot(snapshotId);

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
        return await SnapshotManager.listSnapshots();
    }

    async getSessionStats(): Promise<SessionStats> {
        const sessionDuration = Date.now() - this.sessionStartTime.getTime();
        const snapshots = await SnapshotManager.listSnapshots();

        return {
            totalInteractions: this.interactionCount,
            sessionDuration: Math.round(sessionDuration / 1000),
            snapshotStats: {
                totalSnapshots: snapshots.length,
                latestSnapshot: snapshots[0]?.id,
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
            type: 'system_info',
            level: 'info',
            message: `Task queued: ${this.messageQueue.length} task(s) waiting. Current task: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`,
        } as SystemInfoEvent);
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
        this.editModeManager.reset();
    }
}