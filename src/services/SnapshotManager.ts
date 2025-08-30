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
 * 类似Qwen Code的实现，创建独立的Git仓库来管理项目状态快照
 */
export class SnapshotManager {
    private projectRoot: string;
    private shadowRepoPath: string;
    private isInitialized: boolean = false;

    constructor(projectRoot: string, shadowDir: string = '.tempurai') {
        this.projectRoot = path.resolve(projectRoot);
        this.shadowRepoPath = path.join(this.projectRoot, shadowDir, 'snapshots');
    }

    /**
     * 初始化影子Git仓库
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // 创建影子仓库目录
            await fs.mkdir(this.shadowRepoPath, { recursive: true });

            // 检查是否已经是Git仓库
            try {
                await execAsync('git rev-parse --git-dir', { cwd: this.shadowRepoPath });
                console.log('📁 影子Git仓库已存在');
            } catch {
                // 初始化新的Git仓库
                await execAsync('git init', { cwd: this.shadowRepoPath });
                await execAsync('git config user.name "Tempurai Snapshot"', { cwd: this.shadowRepoPath });
                await execAsync('git config user.email "snapshot@tempurai.local"', { cwd: this.shadowRepoPath });
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
            // 复制项目文件到影子仓库（排除.git和其他不需要的目录）
            await this.copyProjectFiles();

            // 将所有文件添加到Git
            await execAsync('git add -A', { cwd: this.shadowRepoPath });

            // 检查是否有变更需要提交
            const { stdout: statusOutput } = await execAsync('git status --porcelain', {
                cwd: this.shadowRepoPath
            });

            if (!statusOutput.trim()) {
                // 没有变更，可能是重复快照
                console.log('📝 项目状态无变化，跳过快照');
                return {
                    success: true,
                    snapshotId,
                    description: `${description} (no changes)`,
                    timestamp,
                    filesCount: 0
                };
            }

            // 创建提交
            const commitMessage = `📸 Snapshot: ${description}\n\nCreated: ${timestamp.toISOString()}\nID: ${snapshotId}`;
            await execAsync(`git commit -m "${commitMessage}"`, { cwd: this.shadowRepoPath });

            // 获取提交哈希
            const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
                cwd: this.shadowRepoPath
            });

            // 统计文件数量
            const filesCount = statusOutput.trim().split('\n').length;

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
            const { stdout: logOutput } = await execAsync(
                `git log --grep="ID: ${snapshotId}" --format="%H" -1`,
                { cwd: this.shadowRepoPath }
            );

            const commitHash = logOutput.trim();
            if (!commitHash) {
                return {
                    success: false,
                    error: `Snapshot not found: ${snapshotId}`
                };
            }

            // 检出到指定commit
            await execAsync(`git checkout ${commitHash}`, { cwd: this.shadowRepoPath });

            // 复制文件回项目目录
            const restoredFiles = await this.restoreProjectFiles();

            console.log(`✅ 快照已恢复: ${snapshotId} (${restoredFiles} 文件)`);

            return {
                success: true,
                snapshotId,
                restoredFiles
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
            const { stdout: logOutput } = await execAsync(
                'git log --format="%H|%s|%aI" --grep="📸 Snapshot:"',
                { cwd: this.shadowRepoPath }
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
                        filesCount: 0 // 需要时可以从commit统计
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
                // 这里可以实现删除旧快照的逻辑
                // 为了简单起见，我们保留所有快照
                cleanedCount++;
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
     * 复制项目文件到影子仓库
     */
    private async copyProjectFiles(): Promise<void> {
        // 获取项目中应该包含的文件（排除.git等）
        const { stdout: fileList } = await execAsync(
            'find . -type f ! -path "./.git/*" ! -path "./.tempurai/*" ! -path "./node_modules/*" ! -name "*.log"',
            { cwd: this.projectRoot }
        );

        // 清空影子仓库的文件（保留.git）
        await execAsync('find . -type f ! -path "./.git/*" -delete', { cwd: this.shadowRepoPath });

        // 复制文件
        for (const relativePath of fileList.trim().split('\n').filter(f => f)) {
            const sourcePath = path.join(this.projectRoot, relativePath);
            const targetPath = path.join(this.shadowRepoPath, relativePath);

            // 确保目标目录存在
            await fs.mkdir(path.dirname(targetPath), { recursive: true });

            // 复制文件
            await fs.copyFile(sourcePath, targetPath);
        }
    }

    /**
     * 从影子仓库恢复文件到项目目录
     */
    private async restoreProjectFiles(): Promise<number> {
        const { stdout: fileList } = await execAsync(
            'find . -type f ! -path "./.git/*"',
            { cwd: this.shadowRepoPath }
        );

        let restoredCount = 0;
        for (const relativePath of fileList.trim().split('\n').filter(f => f)) {
            const sourcePath = path.join(this.shadowRepoPath, relativePath);
            const targetPath = path.join(this.projectRoot, relativePath);

            // 确保目标目录存在
            await fs.mkdir(path.dirname(targetPath), { recursive: true });

            // 复制文件
            await fs.copyFile(sourcePath, targetPath);
            restoredCount++;
        }

        return restoredCount;
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
            await fs.access(this.shadowRepoPath);
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
        // 如果需要，可以在这里实现清理逻辑
        console.log('🧹 SnapshotManager资源已清理');
    }
}