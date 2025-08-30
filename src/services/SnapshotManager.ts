import { exec } from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as os from 'os';

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
 * 快照管理器 - 外部存储 + 配置隔离 + 完整恢复
 */
export class SnapshotManager {
    private projectRoot: string;
    private shadowGitDir: string;
    private shadowRepoRoot: string;
    private projectHash: string;
    private isInitialized: boolean = false;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);

        // 生成项目哈希，确保多项目独立
        this.projectHash = crypto.createHash('md5')
            .update(this.projectRoot)
            .digest('hex')
            .substring(0, 12);

        // 存储在用户home目录，避免污染项目
        this.shadowRepoRoot = path.join(os.homedir(), '.tempurai', 'snapshots', this.projectHash);
        this.shadowGitDir = path.join(this.shadowRepoRoot, '.git');
    }

    /**
     * 初始化影子Git仓库
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            await fs.mkdir(this.shadowRepoRoot, { recursive: true });

            // 检查是否已初始化
            try {
                await this.execGitCommand('rev-parse --git-dir');
                console.log('📁 影子Git仓库已存在');
            } catch {
                // 初始化Git仓库
                await this.execGitCommand('init');

                // 设置隔离的Git配置
                await this.execGitCommand('config user.name "Tempurai Snapshot"');
                await this.execGitCommand('config user.email "snapshot@tempurai.local"');
                await this.execGitCommand('config commit.gpgsign false');

                // 同步.gitignore
                await this.syncGitignore();

                // 创建初始提交建立HEAD
                await this.execGitCommand('commit --allow-empty -m "🌱 Initial snapshot repository"');

                console.log('🆕 影子Git仓库已初始化');
            }

            this.isInitialized = true;
        } catch (error) {
            throw new Error(`Failed to initialize snapshot manager: ${error}`);
        }
    }

    /**
     * 同步项目的.gitignore
     */
    private async syncGitignore(): Promise<void> {
        try {
            const projectGitignore = path.join(this.projectRoot, '.gitignore');
            const shadowGitignore = path.join(this.shadowRepoRoot, '.gitignore');

            try {
                const content = await fs.readFile(projectGitignore, 'utf8');
                await fs.writeFile(shadowGitignore, content);
            } catch {
                // 项目没有.gitignore，创建基本的
                const defaultIgnore = `.git/\n.tempurai/\nnode_modules/\n*.log\n.DS_Store`;
                await fs.writeFile(shadowGitignore, defaultIgnore);
            }
        } catch (error) {
            console.warn('⚠️ 无法同步.gitignore:', error);
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
            // 重新同步.gitignore（防止被修改）
            await this.syncGitignore();

            // 添加所有文件
            await this.execGitCommand('add .');

            // 检查是否有变更
            let statusOutput = '';
            try {
                const { stdout } = await this.execGitCommand('diff --cached --name-only');
                statusOutput = stdout.trim();
            } catch {
                // 首次提交情况
                const { stdout } = await this.execGitCommand('ls-files --cached');
                statusOutput = stdout.trim();
            }

            if (!statusOutput) {
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
            await this.execGitCommand(`commit -m "${commitMessage}"`);

            // 获取提交哈希和文件数
            const { stdout: commitHash } = await this.execGitCommand('rev-parse HEAD');
            const filesCount = statusOutput.split('\n').filter(line => line.trim()).length;

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
            // 查找commit hash
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

            // 检查主项目是否有未提交变更
            try {
                const { stdout: mainStatus } = await execAsync('git status --porcelain', {
                    cwd: this.projectRoot
                });
                if (mainStatus.trim()) {
                    console.log('⚠️ 警告: 主项目有未提交变更，恢复快照会覆盖这些变更');
                }
            } catch {
                // 主项目可能不是Git仓库，继续
            }

            // 恢复文件（现代命令）
            await this.execGitCommand(`restore --source=${commitHash} -- .`);

            // 清理不在快照中的文件 - 这是关键步骤！
            await this.execGitCommand('clean -f -d');

            console.log(`✅ 快照已恢复: ${snapshotId}`);

            return {
                success: true,
                snapshotId
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

                const idMatch = subject.match(/ID: ([a-f0-9]+)/);
                const descMatch = subject.match(/📸 Snapshot: (.+)/);

                if (idMatch && descMatch) {
                    snapshots.push({
                        id: idMatch[1],
                        commitHash,
                        description: descMatch[1],
                        timestamp: new Date(dateStr),
                        filesCount: 0 // 简化：不计算具体数量以提高性能
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

        const oldSnapshots = snapshots.filter(s => s.timestamp < cutoffDate);

        if (oldSnapshots.length > 0) {
            try {
                // 简单的垃圾回收，让Git自动清理不可达的commit
                await this.execGitCommand('gc --prune=now');
                console.log(`🧹 已清理并压缩快照历史`);
            } catch {
                console.warn('⚠️ 清理失败');
            }
        }

        return oldSnapshots.length;
    }

    /**
     * 生成快照ID
     */
    private generateSnapshotId(description: string): string {
        const content = description + Date.now() + Math.random();
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
    }

    /**
     * 执行Git命令 - 使用环境变量隔离
     */
    private async execGitCommand(command: string): Promise<{ stdout: string, stderr: string }> {
        const env = {
            ...process.env,
            GIT_DIR: this.shadowGitDir,
            GIT_WORK_TREE: this.projectRoot,
            HOME: this.shadowRepoRoot, // 隔离用户配置
            GIT_CONFIG_GLOBAL: '/dev/null', // 忽略全局配置
        };

        return await execAsync(`git ${command}`, {
            cwd: this.projectRoot,
            env
        });
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

        await fs.access(this.shadowGitDir);
        status.shadowRepoExists = true;

        if (this.isInitialized) {
            const snapshots = await this.listSnapshots();
            status.snapshotCount = snapshots.length;
            status.latestSnapshot = snapshots[0];
        }

        return status;
    }
}