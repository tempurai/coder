import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import * as path from 'path';

const execAsync = util.promisify(exec);

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

/**
 * 开始新的编码任务工具
 * 为每个编码任务创建独立的Git分支
 */
export const startTaskTool = {
    id: 'start_task',
    name: 'Start Coding Task',
    description: `Start a new coding task by creating a dedicated Git branch.
    
    This must be called before making any file modifications. It creates a clean
    working environment where all changes will be tracked and can be easily reviewed,
    committed, or discarded.
    
    The branch name will be automatically generated as: tempurai-task-{timestamp}`,
    
    parameters: z.object({
        taskDescription: z.string().describe('Brief description of the coding task'),
        mainBranch: z.string().default('main').describe('Main branch to create task branch from')
    }),
    
    execute: async ({ taskDescription, mainBranch }: {
        taskDescription: string;
        mainBranch: string;
    }) => {
        console.log('🚀 Starting new coding task...');
        console.log(`📝 Task: ${taskDescription}`);
        console.log(`🌿 Base branch: ${mainBranch}`);
        
        try {
            // 检查当前Git状态
            const { stdout: currentBranch } = await execAsync('git branch --show-current');
            const current = currentBranch.trim();
            
            // 检查是否已经在任务分支上
            if (current.startsWith('tempurai-task-')) {
                return {
                    success: false,
                    error: `Already on task branch: ${current}. Use end_task or discard_task first.`,
                    currentBranch: current
                };
            }
            
            // 检查是否有未提交的更改
            const { stdout: statusOutput } = await execAsync('git status --porcelain');
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
                await execAsync(`git checkout ${mainBranch}`);
            }
            
            // 拉取最新更改
            try {
                console.log('📥 Pulling latest changes...');
                await execAsync(`git pull origin ${mainBranch}`);
            } catch (pullError) {
                console.warn('⚠️ Could not pull latest changes, continuing with local branch');
            }
            
            // 创建新的任务分支
            const timestamp = Date.now();
            const taskBranchName = `tempurai-task-${timestamp}`;
            
            console.log(`🌱 Creating task branch: ${taskBranchName}`);
            await execAsync(`git checkout -b ${taskBranchName}`);
            
            // 创建初始提交来记录任务开始
            const taskCommitMessage = `🚀 Start task: ${taskDescription}`;
            try {
                // 创建一个任务描述文件
                await execAsync(`echo "Task: ${taskDescription}\\nStarted: ${new Date().toISOString()}\\nBranch: ${taskBranchName}" > .tempurai-task.md`);
                await execAsync('git add .tempurai-task.md');
                await execAsync(`git commit -m "${taskCommitMessage}"`);
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
};

/**
 * 提交变更到任务分支工具
 * 提交当前暂存区的文件到任务分支
 */
export const commitChangesTool = {
    id: 'commit_changes',
    name: 'Commit Changes',
    description: `Commit staged changes to the current task branch.
    
    This creates an atomic commit for a logical unit of work. Use this after
    making a coherent set of changes that represent a single step in your task.
    
    Make sure to stage files with shell_executor first (git add ...)`,
    
    parameters: z.object({
        commitMessage: z.string().describe('Descriptive commit message for the changes'),
        autoStage: z.boolean().default(false).describe('Automatically stage all modified files before committing')
    }),
    
    execute: async ({ commitMessage, autoStage }: {
        commitMessage: string;
        autoStage: boolean;
    }) => {
        console.log('💾 Committing changes...');
        console.log(`📝 Message: ${commitMessage}`);
        
        try {
            // 检查当前分支
            const { stdout: currentBranch } = await execAsync('git branch --show-current');
            const current = currentBranch.trim();
            
            if (!current.startsWith('tempurai-task-')) {
                return {
                    success: false,
                    error: `Not on a task branch. Current branch: ${current}. Use start_task first.`
                };
            }
            
            // 自动暂存所有文件（如果请求）
            if (autoStage) {
                console.log('📁 Auto-staging all modified files...');
                await execAsync('git add -A');
            }
            
            // 检查是否有暂存的更改
            const { stdout: stagedFiles } = await execAsync('git diff --cached --name-only');
            if (!stagedFiles.trim()) {
                return {
                    success: false,
                    error: 'No staged changes to commit. Use git add to stage files first, or set autoStage=true.'
                };
            }
            
            // 获取暂存文件的详细信息
            const { stdout: diffStat } = await execAsync('git diff --cached --stat');
            
            // 执行提交
            await execAsync(`git commit -m "${commitMessage}"`);
            
            // 获取提交哈希
            const { stdout: commitHash } = await execAsync('git rev-parse HEAD');
            
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
};

/**
 * 结束任务工具
 * 展示任务分支相对于主分支的所有变更
 */
export const endTaskTool = {
    id: 'end_task',
    name: 'End Coding Task',
    description: `End the current coding task and show a summary of all changes.
    
    This tool generates a comprehensive diff showing all changes made during
    the task relative to the main branch. After reviewing, the user can decide
    whether to merge the branch, continue working, or discard the changes.`,
    
    parameters: z.object({
        mainBranch: z.string().default('main').describe('Main branch to compare against')
    }),
    
    execute: async ({ mainBranch }: {
        mainBranch: string;
    }) => {
        console.log('🏁 Ending coding task...');
        
        try {
            // 检查当前分支
            const { stdout: currentBranch } = await execAsync('git branch --show-current');
            const current = currentBranch.trim();
            
            if (!current.startsWith('tempurai-task-')) {
                return {
                    success: false,
                    error: `Not on a task branch. Current branch: ${current}`
                };
            }
            
            // 检查是否有未提交的更改
            const { stdout: statusOutput } = await execAsync('git status --porcelain');
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
                const { stdout: statOutput } = await execAsync(`git diff ${mainBranch}...HEAD --stat`);
                diffStats = statOutput.trim();
                
                // 计算改变的文件数
                const statLines = diffStats.split('\n');
                const summaryLine = statLines[statLines.length - 1];
                const match = summaryLine.match(/(\d+) files? changed/);
                filesChanged = match ? parseInt(match[1]) : 0;
                
                // 获取完整diff
                const { stdout: fullDiff } = await execAsync(`git diff ${mainBranch}...HEAD`);
                diffOutput = fullDiff;
                
            } catch (diffError) {
                console.warn('Could not generate diff:', diffError);
                diffOutput = 'Error generating diff';
                diffStats = 'Statistics unavailable';
            }
            
            // 获取提交历史
            let commitHistory = '';
            try {
                const { stdout: logOutput } = await execAsync(`git log ${mainBranch}..HEAD --oneline`);
                commitHistory = logOutput.trim();
            } catch (logError) {
                commitHistory = 'Could not retrieve commit history';
            }
            
            // 读取任务描述（如果存在）
            let taskDescription = 'No task description available';
            try {
                const { stdout: taskFile } = await execAsync('cat .tempurai-task.md 2>/dev/null || echo ""');
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
                    'Discard changes: use discard_task tool'
                ]
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to end task: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
};

/**
 * 丢弃任务工具
 * 删除任务分支并切换回主分支
 */
export const discardTaskTool = {
    id: 'discard_task',
    name: 'Discard Task',
    description: `Discard the current task branch and all its changes.
    
    This is a destructive operation that will permanently delete the task branch
    and all commits made on it. Use this when you want to abandon the current
    task and start fresh.
    
    WARNING: This cannot be undone!`,
    
    parameters: z.object({
        mainBranch: z.string().default('main').describe('Main branch to return to'),
        confirm: z.boolean().default(false).describe('Confirm that you want to discard all changes')
    }),
    
    execute: async ({ mainBranch, confirm }: {
        mainBranch: string;
        confirm: boolean;
    }) => {
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
            const { stdout: currentBranch } = await execAsync('git branch --show-current');
            const current = currentBranch.trim();
            
            if (!current.startsWith('tempurai-task-')) {
                return {
                    success: false,
                    error: `Not on a task branch. Current branch: ${current}`
                };
            }
            
            // 获取任务信息用于确认
            let taskInfo = `Task branch: ${current}`;
            try {
                const { stdout: logOutput } = await execAsync(`git log ${mainBranch}..HEAD --oneline`);
                const commitCount = logOutput.trim().split('\n').length;
                taskInfo += `\\nCommits to be lost: ${commitCount}`;
            } catch {
                // Ignore error
            }
            
            // 切换到主分支
            console.log(`🔄 Switching to ${mainBranch}...`);
            await execAsync(`git checkout ${mainBranch}`);
            
            // 删除任务分支
            console.log(`🗑️ Deleting task branch: ${current}`);
            await execAsync(`git branch -D ${current}`);
            
            // 清理任务文件（如果存在）
            try {
                await execAsync('rm -f .tempurai-task.md');
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
};

/**
 * 获取Git工作流状态工具
 * 显示当前Git工作流状态信息
 */
export const getWorkflowStatusTool = {
    id: 'get_workflow_status',
    name: 'Get Workflow Status',
    description: 'Get current Git workflow status and branch information',
    
    parameters: z.object({}),
    
    execute: async () => {
        try {
            // 获取当前分支
            const { stdout: currentBranch } = await execAsync('git branch --show-current');
            const current = currentBranch.trim();
            
            // 检查是否是任务分支
            const isTaskBranch = current.startsWith('tempurai-task-');
            
            // 获取状态信息
            const { stdout: statusOutput } = await execAsync('git status --porcelain');
            const hasChanges = statusOutput.trim().length > 0;
            const uncommittedFiles = hasChanges ? statusOutput.trim().split('\n') : [];
            
            // 获取可能的主分支
            let mainBranch = 'main';
            try {
                const { stdout: branches } = await execAsync('git branch -r');
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
                    const { stdout: taskFile } = await execAsync('cat .tempurai-task.md 2>/dev/null || echo ""');
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
};

// 导出Git工作流工具集合
export const gitWorkflowTools = {
    start_task: startTaskTool,
    commit_changes: commitChangesTool,
    end_task: endTaskTool,
    discard_task: discardTaskTool,
    get_workflow_status: getWorkflowStatusTool
};