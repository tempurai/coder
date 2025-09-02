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
    /**
     * 创建项目状态快照
     */
    static async createSnapshot(description: string, projectRoot: string = process.cwd()): Promise<SnapshotResult> {
        const paths = this.calculatePaths(projectRoot);
        await this.ensureInitialized(paths);

        const timestamp = new Date();
        const snapshotId = this.generateSnapshotId(description);

        console.log(`📸 创建快照: ${description}`);

        try {
            // 添加所有文件
            await this.execGitCommand(paths, 'add .');

            // 检查是否有变更
            let statusOutput = '';
            try {
                const { stdout } = await this.execGitCommand(paths, 'diff --cached --name-only');
                statusOutput = stdout.trim();
            } catch {
                // 首次提交情况
                const { stdout } = await this.execGitCommand(paths, 'ls-files --cached');
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
            await this.execGitCommand(paths, `commit -m "${commitMessage}"`);

            // 获取提交哈希和文件数
            const { stdout: commitHash } = await this.execGitCommand(paths, 'rev-parse HEAD');
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
    static async restoreSnapshot(snapshotId: string, projectRoot: string = process.cwd()): Promise<RestoreResult> {
        const paths = this.calculatePaths(projectRoot);
        await this.ensureInitialized(paths);

        console.log(`🔄 恢复快照: ${snapshotId}`);

        try {
            // 查找commit hash
            const { stdout: logOutput } = await this.execGitCommand(paths,
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
                    cwd: paths.projectRoot
                });
                if (mainStatus.trim()) {
                    console.log('⚠️ 警告: 主项目有未提交变更，恢复快照会覆盖这些变更');
                }
            } catch {
                // 主项目可能不是Git仓库，继续
            }

            // 恢复文件（现代命令）
            await this.execGitCommand(paths, `restore --source=${commitHash} -- .`);

            // 清理不在快照中的文件 - 这是关键步骤！
            await this.execGitCommand(paths, 'clean -f -d');

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
    static async listSnapshots(projectRoot: string = process.cwd()): Promise<SnapshotInfo[]> {
        const paths = this.calculatePaths(projectRoot);
        await this.ensureInitialized(paths);

        try {
            const { stdout: logOutput } = await this.execGitCommand(paths,
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
     * 计算项目相关路径
     */
    private static calculatePaths(projectRoot: string) {
        const resolvedRoot = path.resolve(projectRoot);
        
        // 生成项目哈希，确保多项目独立
        const projectHash = crypto.createHash('md5')
            .update(resolvedRoot)
            .digest('hex')
            .substring(0, 12);

        // 存储在用户home目录，避免污染项目
        const shadowRepoRoot = path.join(os.homedir(), '.tempurai', 'snapshots', projectHash);
        const shadowGitDir = path.join(shadowRepoRoot, '.git');

        return {
            projectRoot: resolvedRoot,
            projectHash,
            shadowRepoRoot,
            shadowGitDir
        };
    }

    /**
     * 确保影子Git仓库已初始化
     */
    private static async ensureInitialized(paths: ReturnType<typeof this.calculatePaths>): Promise<void> {
        try {
            await fs.mkdir(paths.shadowRepoRoot, { recursive: true });

            // 检查是否已初始化
            try {
                await this.execGitCommand(paths, 'rev-parse --git-dir');
            } catch {
                // 初始化Git仓库
                await this.execGitCommand(paths, 'init');
                await this.execGitCommand(paths, 'config user.name "Tempurai Snapshot"');
                await this.execGitCommand(paths, 'config user.email "snapshot@tempurai.local"');
                await this.execGitCommand(paths, 'config commit.gpgsign false');

                // 创建基本的.gitignore
                const gitignore = `.git/\n.tempurai/\nnode_modules/\n*.log\n.DS_Store\n`;
                await fs.writeFile(path.join(paths.shadowRepoRoot, '.gitignore'), gitignore);

                // 创建初始提交
                await this.execGitCommand(paths, 'commit --allow-empty -m "🌱 Initial snapshot repository"');
                console.log('🆕 影子Git仓库已初始化');
            }
        } catch (error) {
            throw new Error(`Failed to initialize snapshot manager: ${error}`);
        }
    }

    /**
     * 生成快照ID
     */
    private static generateSnapshotId(description: string): string {
        const content = description + Date.now() + Math.random();
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
    }

    /**
     * 执行Git命令 - 使用环境变量隔离
     */
    private static async execGitCommand(
        paths: ReturnType<typeof this.calculatePaths>, 
        command: string
    ): Promise<{ stdout: string, stderr: string }> {
        const env = {
            ...process.env,
            GIT_DIR: paths.shadowGitDir,
            GIT_WORK_TREE: paths.projectRoot,
            HOME: paths.shadowRepoRoot, // 隔离用户配置
            GIT_CONFIG_GLOBAL: '/dev/null', // 忽略全局配置
        };

        return await execAsync(`git ${command}`, {
            cwd: paths.projectRoot,
            env
        });
    }
}