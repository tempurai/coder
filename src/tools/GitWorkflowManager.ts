import { exec } from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as crypto from 'crypto';

const execAsync = util.promisify(exec);

/**
 * 生成任务哈希
 * @param taskDescription 任务描述
 * @returns 短哈希字符串
 */
function generateTaskHash(taskDescription: string): string {
    const hash = crypto.createHash('sha256')
        .update(taskDescription + Date.now())
        .digest('hex');
    return hash.substring(0, 8); // 取前8位作为短哈希
}

export interface GitWorkflowState {
    currentBranch: string;
    isTaskBranch: boolean;
    taskBranchName?: string;
    mainBranch: string;
    hasChanges: boolean;
    uncommittedFiles: string[];
}

export interface TaskBranchInfo {
    branchName: string;
    created: Date;
    taskDescription: string;
    mainBranch: string;
}

export interface GitDiffResult {
    diff: string;
    filesChanged: number;
    additions: number;
    deletions: number;
    summary: string;
}

export interface TaskStartResult {
    success: boolean;
    taskBranchName?: string;
    taskDescription?: string;
    mainBranch?: string;
    created?: string;
    message?: string;
    error?: string;
    currentBranch?: string;
    uncommittedChanges?: string[];
}

export interface TaskCommitResult {
    success: boolean;
    commitHash?: string;
    shortHash?: string;
    branch?: string;
    message?: string;
    diffStat?: string;
    stagedFiles?: string[];
    error?: string;
}

export interface TaskEndResult {
    success: boolean;
    taskBranch?: string;
    mainBranch?: string;
    taskDescription?: string;
    filesChanged?: number;
    hasUncommittedChanges?: boolean;
    uncommittedFiles?: string[];
    commitHistory?: string;
    diffStats?: string;
    fullDiff?: string;
    summary?: string;
    nextSteps?: string[];
    error?: string;
}

export interface TaskDiscardResult {
    success: boolean;
    discardedBranch?: string;
    currentBranch?: string;
    message?: string;
    taskInfo?: string;
    error?: string;
    warning?: string;
}

export interface WorkflowStatusResult {
    success: boolean;
    currentBranch?: string;
    isTaskBranch?: boolean;
    taskBranchName?: string | null;
    mainBranch?: string;
    hasChanges?: boolean;
    uncommittedFiles?: string[];
    taskInfo?: any;
    status?: string;
    message?: string;
    error?: string;
}

/**
 * Git工作流管理器
 * 
 * 这个类负责管理任务的生命周期：
 * - 创建任务分支
 * - 提交变更  
 * - 结束任务并生成摘要
 * - 丢弃任务
 * - 获取工作流状态
 * 
 * 与Agent工具不同，这些是策略层的管理操作，
 * 由程序逻辑（如SessionService）调用，而不是由Agent决定。
 */
export class GitWorkflowManager {
    private workingDirectory: string;

    constructor(workingDirectory?: string) {
        this.workingDirectory = workingDirectory || process.cwd();
    }

    /**
     * 开始新的编码任务
     * 为每个编码任务创建独立的Git分支
     */
    async startTask(taskDescription: string, mainBranch: string = 'main'): Promise<TaskStartResult> {
        console.log('🚀 Starting new coding task...');
        console.log(`📝 Task: ${taskDescription}`);
        console.log(`🌿 Base branch: ${mainBranch}`);
        
        try {
            // 检查当前Git状态
            const { stdout: currentBranch } = await execAsync('git branch --show-current', { 
                cwd: this.workingDirectory 
            });
            const current = currentBranch.trim();
            
            // 检查是否已经在任务分支上
            if (current.startsWith('tempurai/task-')) {
                return {
                    success: false,
                    error: `Already on task branch: ${current}. Use end_task or discard_task first.`,
                    currentBranch: current
                };
            }
            
            // 检查是否有未提交的更改
            const { stdout: statusOutput } = await execAsync('git status --porcelain', { 
                cwd: this.workingDirectory 
            });
            if (statusOutput.trim()) {
                return {
                    success: false,
                    error: 'You have uncommitted changes. Please commit or stash them before starting a new task.',
                    uncommittedChanges: statusOutput.trim().split('\n')
                };
            }
            
            // 确保在正确的主分支上
            if (current !== mainBranch) {
                console.log(`🔄 Switching to ${mainBranch}...`);
                await execAsync(`git checkout ${mainBranch}`, { cwd: this.workingDirectory });
            }
            
            // 拉取最新更改
            try {
                console.log('📥 Pulling latest changes...');
                await execAsync(`git pull origin ${mainBranch}`, { cwd: this.workingDirectory });
            } catch (pullError) {
                console.warn('⚠️ Could not pull latest changes, continuing with local branch');
            }
            
            // 创建新的任务分支
            const taskHash = generateTaskHash(taskDescription);
            const taskBranchName = `tempurai/task-${taskHash}`;
            
            console.log(`🌱 Creating task branch: ${taskBranchName}`);
            await execAsync(`git checkout -b ${taskBranchName}`, { cwd: this.workingDirectory });
            
            // 创建初始提交来记录任务开始
            const taskCommitMessage = `🚀 Start task: ${taskDescription}`;
            try {
                // 创建一个任务描述文件
                const taskFileContent = `Task: ${taskDescription}\\nStarted: ${new Date().toISOString()}\\nBranch: ${taskBranchName}`;
                await execAsync(`echo "${taskFileContent}" > .tempurai-task.md`, { cwd: this.workingDirectory });
                await execAsync('git add .tempurai-task.md', { cwd: this.workingDirectory });
                await execAsync(`git commit -m "${taskCommitMessage}"`, { cwd: this.workingDirectory });
            } catch (commitError) {
                console.warn('⚠️ Could not create initial task commit, continuing...');
            }
            
            console.log('✅ Task branch created successfully!');
            console.log('🎯 You can now start making changes. All modifications will be tracked in this branch.');
            
            return {
                success: true,
                taskBranchName,
                taskDescription,
                mainBranch,
                created: new Date().toISOString(),
                message: `Task branch '${taskBranchName}' created. Ready for development!`
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to create task branch: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * 提交变更到任务分支
     * 提交当前暂存区的文件到任务分支
     */
    async commitChanges(commitMessage: string, autoStage: boolean = false): Promise<TaskCommitResult> {
        console.log('💾 Committing changes...');
        console.log(`📝 Message: ${commitMessage}`);
        
        try {
            // 检查当前分支
            const { stdout: currentBranch } = await execAsync('git branch --show-current', { 
                cwd: this.workingDirectory 
            });
            const current = currentBranch.trim();
            
            if (!current.startsWith('tempurai/task-')) {
                return {
                    success: false,
                    error: `Not on a task branch. Current branch: ${current}. Use startTask first.`
                };
            }
            
            // 自动暂存所有文件（如果请求）
            if (autoStage) {
                console.log('📁 Auto-staging all modified files...');
                await execAsync('git add -A', { cwd: this.workingDirectory });
            }
            
            // 检查是否有暂存的更改
            const { stdout: stagedFiles } = await execAsync('git diff --cached --name-only', { 
                cwd: this.workingDirectory 
            });
            if (!stagedFiles.trim()) {
                return {
                    success: false,
                    error: 'No staged changes to commit. Use git add to stage files first, or set autoStage=true.'
                };
            }
            
            // 获取暂存文件的详细信息
            const { stdout: diffStat } = await execAsync('git diff --cached --stat', { 
                cwd: this.workingDirectory 
            });
            
            // 执行提交
            await execAsync(`git commit -m "${commitMessage}"`, { cwd: this.workingDirectory });
            
            // 获取提交哈希
            const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { 
                cwd: this.workingDirectory 
            });
            
            console.log('✅ Changes committed successfully!');
            console.log(`🔗 Commit: ${commitHash.trim().substring(0, 7)}`);
            
            return {
                success: true,
                commitHash: commitHash.trim(),
                shortHash: commitHash.trim().substring(0, 7),
                branch: current,
                message: commitMessage,
                diffStat: diffStat.trim(),
                stagedFiles: stagedFiles.trim().split('\n').filter(f => f.length > 0)
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * 结束任务
     * 展示任务分支相对于主分支的所有变更
     */
    async endTask(mainBranch: string = 'main'): Promise<TaskEndResult> {
        console.log('🏁 Ending coding task...');
        
        try {
            // 检查当前分支
            const { stdout: currentBranch } = await execAsync('git branch --show-current', { 
                cwd: this.workingDirectory 
            });
            const current = currentBranch.trim();
            
            if (!current.startsWith('tempurai/task-')) {
                return {
                    success: false,
                    error: `Not on a task branch. Current branch: ${current}`
                };
            }
            
            // 检查是否有未提交的更改
            const { stdout: statusOutput } = await execAsync('git status --porcelain', { 
                cwd: this.workingDirectory 
            });
            const hasUncommittedChanges = statusOutput.trim().length > 0;
            
            if (hasUncommittedChanges) {
                console.log('⚠️ Warning: You have uncommitted changes.');
                console.log('Consider committing them first or they won\'t be included in the task summary.');
            }
            
            // 生成任务总结diff
            let diffOutput = '';
            let diffStats = '';
            let filesChanged = 0;
            
            try {
                // 获取diff统计
                const { stdout: statOutput } = await execAsync(`git diff ${mainBranch}...HEAD --stat`, { 
                    cwd: this.workingDirectory 
                });
                diffStats = statOutput.trim();
                
                // 计算改变的文件数
                const statLines = diffStats.split('\n');
                const summaryLine = statLines[statLines.length - 1];
                const match = summaryLine.match(/(\d+) files? changed/);
                filesChanged = match ? parseInt(match[1]) : 0;
                
                // 获取完整diff
                const { stdout: fullDiff } = await execAsync(`git diff ${mainBranch}...HEAD`, { 
                    cwd: this.workingDirectory 
                });
                diffOutput = fullDiff;
                
            } catch (diffError) {
                console.warn('Could not generate diff:', diffError);
                diffOutput = 'Error generating diff';
                diffStats = 'Statistics unavailable';
            }
            
            // 获取提交历史
            let commitHistory = '';
            try {
                const { stdout: logOutput } = await execAsync(`git log ${mainBranch}..HEAD --oneline`, { 
                    cwd: this.workingDirectory 
                });
                commitHistory = logOutput.trim();
            } catch (logError) {
                commitHistory = 'Could not retrieve commit history';
            }
            
            // 读取任务描述（如果存在）
            let taskDescription = 'No task description available';
            try {
                const { stdout: taskFile } = await execAsync('cat .tempurai-task.md 2>/dev/null || echo ""', { 
                    cwd: this.workingDirectory 
                });
                if (taskFile.trim()) {
                    const lines = taskFile.trim().split('\n');
                    const taskLine = lines.find(line => line.startsWith('Task:'));
                    if (taskLine) {
                        taskDescription = taskLine.replace('Task: ', '');
                    }
                }
            } catch {
                // Ignore error if task file doesn't exist
            }
            
            console.log('✅ Task summary generated!');
            console.log(`📊 Files changed: ${filesChanged}`);
            console.log(`🔀 Commits: ${commitHistory.split('\n').length}`);
            
            return {
                success: true,
                taskBranch: current,
                mainBranch,
                taskDescription,
                filesChanged,
                hasUncommittedChanges,
                uncommittedFiles: hasUncommittedChanges ? statusOutput.trim().split('\n') : [],
                commitHistory,
                diffStats,
                fullDiff: diffOutput,
                summary: `Task completed on branch '${current}' with ${filesChanged} files changed`,
                nextSteps: [
                    'Review the changes above',
                    'Merge the branch if satisfied: git checkout main && git merge ' + current,
                    'Continue working: keep making changes and commits',
                    'Discard changes: use discardTask method'
                ]
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to end task: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * 丢弃任务
     * 删除任务分支并切换回主分支
     */
    async discardTask(mainBranch: string = 'main', confirm: boolean = false): Promise<TaskDiscardResult> {
        console.log('🗑️ Discarding task...');
        
        if (!confirm) {
            return {
                success: false,
                error: 'Task discard not confirmed. Set confirm=true to proceed.',
                warning: 'This operation will permanently delete all changes in the current task branch.'
            };
        }
        
        try {
            // 检查当前分支
            const { stdout: currentBranch } = await execAsync('git branch --show-current', { 
                cwd: this.workingDirectory 
            });
            const current = currentBranch.trim();
            
            if (!current.startsWith('tempurai/task-')) {
                return {
                    success: false,
                    error: `Not on a task branch. Current branch: ${current}`
                };
            }
            
            // 获取任务信息用于确认
            let taskInfo = `Task branch: ${current}`;
            try {
                const { stdout: logOutput } = await execAsync(`git log ${mainBranch}..HEAD --oneline`, { 
                    cwd: this.workingDirectory 
                });
                const commitCount = logOutput.trim().split('\n').length;
                taskInfo += `\\nCommits to be lost: ${commitCount}`;
            } catch {
                // Ignore error
            }
            
            // 切换到主分支
            console.log(`🔄 Switching to ${mainBranch}...`);
            await execAsync(`git checkout ${mainBranch}`, { cwd: this.workingDirectory });
            
            // 删除任务分支
            console.log(`🗑️ Deleting task branch: ${current}`);
            await execAsync(`git branch -D ${current}`, { cwd: this.workingDirectory });
            
            // 清理任务文件（如果存在）
            try {
                await execAsync('rm -f .tempurai-task.md', { cwd: this.workingDirectory });
            } catch {
                // Ignore error if file doesn't exist
            }
            
            console.log('✅ Task discarded successfully!');
            console.log(`🌿 Now on branch: ${mainBranch}`);
            
            return {
                success: true,
                discardedBranch: current,
                currentBranch: mainBranch,
                message: `Task branch '${current}' has been permanently deleted`,
                taskInfo
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to discard task: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * 获取Git工作流状态
     * 显示当前Git工作流状态信息
     */
    async getWorkflowStatus(): Promise<WorkflowStatusResult> {
        try {
            // 获取当前分支
            const { stdout: currentBranch } = await execAsync('git branch --show-current', { 
                cwd: this.workingDirectory 
            });
            const current = currentBranch.trim();
            
            // 检查是否是任务分支
            const isTaskBranch = current.startsWith('tempurai/task-');
            
            // 获取状态信息
            const { stdout: statusOutput } = await execAsync('git status --porcelain', { 
                cwd: this.workingDirectory 
            });
            const hasChanges = statusOutput.trim().length > 0;
            const uncommittedFiles = hasChanges ? statusOutput.trim().split('\n') : [];
            
            // 获取可能的主分支
            let mainBranch = 'main';
            try {
                const { stdout: branches } = await execAsync('git branch -r', { 
                    cwd: this.workingDirectory 
                });
                if (branches.includes('origin/master')) {
                    mainBranch = 'master';
                }
            } catch {
                // Use default 'main'
            }
            
            let taskInfo = null;
            if (isTaskBranch) {
                // 获取任务信息
                try {
                    const { stdout: taskFile } = await execAsync('cat .tempurai-task.md 2>/dev/null || echo ""', { 
                        cwd: this.workingDirectory 
                    });
                    if (taskFile.trim()) {
                        const lines = taskFile.trim().split('\n');
                        taskInfo = {
                            description: lines.find(l => l.startsWith('Task:'))?.replace('Task: ', '') || 'Unknown',
                            started: lines.find(l => l.startsWith('Started:'))?.replace('Started: ', '') || 'Unknown',
                            branch: current
                        };
                    }
                } catch {
                    // Task file doesn't exist
                }
            }
            
            return {
                success: true,
                currentBranch: current,
                isTaskBranch,
                taskBranchName: isTaskBranch ? current : null,
                mainBranch,
                hasChanges,
                uncommittedFiles,
                taskInfo,
                status: isTaskBranch ? 'In Task' : 'Ready for Task',
                message: isTaskBranch 
                    ? `Currently working on task branch: ${current}`
                    : `Ready to start a new task. Current branch: ${current}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to get workflow status: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * 设置工作目录
     */
    setWorkingDirectory(directory: string): void {
        this.workingDirectory = path.resolve(directory);
    }

    /**
     * 获取工作目录
     */
    getWorkingDirectory(): string {
        return this.workingDirectory;
    }
}