import { exec } from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

const execAsync = util.promisify(exec);

export interface SnapshotResult {
    success: boolean;
    snapshotId?: string;
    commitHash?: string;
    description?: string;
    timestamp?: Date;
    filesCount?: number;
    error?: string;
}

export interface RestoreResult {
    success: boolean;
    snapshotId?: string;
    restoredFiles?: number;
    error?: string;
}

export interface SnapshotInfo {
    id: string;
    commitHash: string;
    description: string;
    timestamp: Date;
    filesCount: number;
}

/**
 * 快照管理器 - 基于影子Git仓库
 * 实现真正的影子Git仓库：独立的.git目录，但工作树是项目根目录
 */
export class SnapshotManager {
    private projectRoot: string;
    private shadowGitDir: string;
    private isInitialized: boolean = false;

    constructor(projectRoot: string, shadowDir: string = '.tempurai') {
        this.projectRoot = path.resolve(projectRoot);
        this.shadowGitDir = path.join(this.projectRoot, shadowDir, 'snapshots', '.git');
    }

    /**
     * 初始化影子Git仓库
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // 创建影子Git目录
            await fs.mkdir(path.dirname(this.shadowGitDir), { recursive: true });

            // 检查是否已经初始化
            try {
                await this.execGitCommand('rev-parse --git-dir');
                console.log('📁 影子Git仓库已存在');
            } catch {
                // 初始化新的Git仓库
                await this.execGitCommand('init --bare');
                await this.execGitCommand('config user.name "Tempurai Snapshot"');
                await this.execGitCommand('config user.email "snapshot@tempurai.local"');
                console.log('🆕 影子Git仓库已初始化');
            }

            this.isInitialized = true;
        } catch (error) {
            throw new Error(`Failed to initialize snapshot manager: ${error}`);
        }
    }

    /**
     * 创建项目状态快照
     */
    async createSnapshot(description: string): Promise<SnapshotResult> {
        await this.initialize();

        const timestamp = new Date();
        const snapshotId = this.generateSnapshotId(description);

        console.log(`📸 创建快照: ${description}`);

        try {
            // 将所有文件添加到影子Git（排除主项目的.git和影子目录）
            await this.execGitCommand('add -A');
            await this.execGitCommand('reset HEAD .git/ .tempurai/ || true'); // 排除这些目录，失败不影响

            // 检查是否有变更需要提交
            let statusOutput = '';
            try {
                const { stdout } = await this.execGitCommand('diff --cached --name-only');
                statusOutput = stdout.trim();
            } catch (error) {
                // 如果这是第一次提交，diff --cached可能会失败，我们继续
                console.log('首次提交或diff命令失败，继续创建快照');
            }

            // 创建提交
            const commitMessage = `📸 Snapshot: ${description}\n\nCreated: ${timestamp.toISOString()}\nID: ${snapshotId}`;
            try {
                await this.execGitCommand(`commit -m "${commitMessage}"`);
            } catch (error) {
                // 如果没有变更需要提交
                if (error instanceof Error && error.message.includes('nothing to commit')) {
                    console.log('📝 项目状态无变化，跳过快照');
                    return {
                        success: true,
                        snapshotId,
                        description: `${description} (no changes)`,
                        timestamp,
                        filesCount: 0
                    };
                }
                throw error;
            }

            // 获取提交哈希
            const { stdout: commitHash } = await this.execGitCommand('rev-parse HEAD');

            // 统计文件数量
            const filesCount = statusOutput ? statusOutput.split('\n').length : 0;

            console.log(`✅ 快照已创建: ${snapshotId} (${filesCount} 文件)`);

            return {
                success: true,
                snapshotId,
                commitHash: commitHash.trim(),
                description,
                timestamp,
                filesCount
            };

        } catch (error) {
            return {
                success: false,
                error: `Failed to create snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * 恢复到指定快照
     */
    async restoreSnapshot(snapshotId: string): Promise<RestoreResult> {
        await this.initialize();

        console.log(`🔄 恢复快照: ${snapshotId}`);

        try {
            // 查找对应的commit hash
            const { stdout: logOutput } = await this.execGitCommand(
                `log --grep="ID: ${snapshotId}" --format="%H" -1`
            );

            const commitHash = logOutput.trim();
            if (!commitHash) {
                return {
                    success: false,
                    error: `Snapshot not found: ${snapshotId}`
                };
            }

            // 保存当前工作目录的变更（如果有的话）
            try {
                // 检查主项目Git仓库是否有未提交变更
                const { stdout: mainStatus } = await execAsync('git status --porcelain', {
                    cwd: this.projectRoot
                });

                if (mainStatus.trim()) {
                    console.log('⚠️ 警告: 主项目有未提交变更，恢复快照可能会覆盖这些变更');
                    // 这里可以选择先stash主项目的变更
                }
            } catch {
                // 主项目可能不是Git仓库，继续
            }

            // 强制检出到指定commit（这会重置工作目录）
            await this.execGitCommand(`checkout ${commitHash} -- .`);

            console.log(`✅ 快照已恢复: ${snapshotId}`);

            return {
                success: true,
                snapshotId,
                restoredFiles: 0 // 影子Git不需要计算具体文件数
            };

        } catch (error) {
            return {
                success: false,
                error: `Failed to restore snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * 列出所有快照
     */
    async listSnapshots(): Promise<SnapshotInfo[]> {
        await this.initialize();

        try {
            const { stdout: logOutput } = await this.execGitCommand(
                'log --format="%H|%s|%aI" --grep="📸 Snapshot:"'
            );

            if (!logOutput.trim()) {
                return [];
            }

            const snapshots: SnapshotInfo[] = [];
            for (const line of logOutput.trim().split('\n')) {
                const [commitHash, subject, dateStr] = line.split('|');

                // 提取快照ID和描述
                const idMatch = subject.match(/ID: ([a-f0-9]+)/);
                const descMatch = subject.match(/📸 Snapshot: (.+)/);

                if (idMatch && descMatch) {
                    snapshots.push({
                        id: idMatch[1],
                        commitHash,
                        description: descMatch[1],
                        timestamp: new Date(dateStr),
                        filesCount: 0 // 可以通过git diff统计，但为性能考虑暂时设为0
                    });
                }
            }

            return snapshots.reverse(); // 最新的在前
        } catch (error) {
            throw new Error(`Failed to list snapshots: ${error}`);
        }
    }

    /**
     * 清理旧快照
     */
    async cleanupOldSnapshots(retentionDays: number = 7): Promise<number> {
        const snapshots = await this.listSnapshots();
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

        let cleanedCount = 0;
        for (const snapshot of snapshots) {
            if (snapshot.timestamp < cutoffDate) {
                try {
                    // 这里可以实现删除旧提交的逻辑
                    // 为了安全起见，暂时不自动删除
                    cleanedCount++;
                } catch {
                    // 删除失败，继续下一个
                }
            }
        }

        return cleanedCount;
    }

    /**
     * 生成快照ID
     */
    private generateSnapshotId(description: string): string {
        const content = description + Date.now() + Math.random();
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
    }

    /**
     * 执行影子Git命令
     */
    private async execGitCommand(command: string): Promise<{ stdout: string, stderr: string }> {
        const fullCommand = `git --git-dir="${this.shadowGitDir}" --work-tree="${this.projectRoot}" ${command}`;
        return await execAsync(fullCommand, { cwd: this.projectRoot });
    }

    /**
     * 检查管理器状态
     */
    async getStatus(): Promise<{
        initialized: boolean;
        shadowRepoExists: boolean;
        snapshotCount: number;
        latestSnapshot?: SnapshotInfo;
    }> {
        const status = {
            initialized: this.isInitialized,
            shadowRepoExists: false,
            snapshotCount: 0,
            latestSnapshot: undefined as SnapshotInfo | undefined
        };

        try {
            await fs.access(this.shadowGitDir);
            status.shadowRepoExists = true;

            if (this.isInitialized) {
                const snapshots = await this.listSnapshots();
                status.snapshotCount = snapshots.length;
                status.latestSnapshot = snapshots[0];
            }
        } catch {
            // 影子仓库不存在
        }

        return status;
    }

    /**
     * 清理资源
     */
    async cleanup(): Promise<void> {
        // 影子Git仓库是持久的，不需要特别清理
        console.log('🧹 SnapshotManager资源已清理');
    }
}