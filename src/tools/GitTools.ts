import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { ErrorHandler } from '../errors/ErrorHandler.js';
import { ToolExecutionResult } from './index.js';

const execAsync = util.promisify(exec);

export const gitStatusTool = {
    id: 'git_status',
    name: 'Git Status',
    description: 'Get the current git repository status',
    parameters: z.object({}),
    execute: async (): Promise<ToolExecutionResult<{ status: string; files: string[] }>> => {
        return ErrorHandler.wrapToolExecution(async () => {
            const { stdout } = await execAsync('git status --porcelain');
            const statusOutput = stdout.trim() || 'Working directory clean';
            const files = stdout.trim() ? stdout.trim().split('\n').map(line => line.substring(3)) : [];
            return { status: statusOutput, files };
        }, 'git_status');
    },
};

export const gitLogTool = {
    id: 'git_log',
    name: 'Git Log',
    description: 'Get recent commit history',
    parameters: z.object({
        count: z.number().default(10).describe('Number of commits to show'),
    }),
    execute: async ({ count }: { count: number }): Promise<ToolExecutionResult<string[]>> => {
        return ErrorHandler.wrapToolExecution(async () => {
            const { stdout } = await execAsync(`git log --oneline -${count}`);
            const commits = stdout.trim().split('\n').filter(line => line.length > 0);
            return commits;
        }, 'git_log');
    },
};

export const gitDiffTool = {
    id: 'git_diff',
    name: 'Git Diff',
    description: 'Show changes in working directory',
    parameters: z.object({
        file: z.string().optional().describe('Specific file to show diff for'),
    }),
    execute: async ({ file }: { file?: string }): Promise<ToolExecutionResult<string>> => {
        return ErrorHandler.wrapToolExecution(async () => {
            const command = file ? `git diff ${file}` : 'git diff';
            const { stdout } = await execAsync(command);
            return stdout.trim() || 'No changes';
        }, 'git_diff');
    },
};

export class GitTools {
    async getRecentChanges(): Promise<string> {
        const { stdout } = await execAsync('git log --oneline -10');
        return stdout;
    }

    async getCurrentDiff(): Promise<string> {
        const { stdout } = await execAsync('git diff');
        return stdout;
    }

    async getFileHistory(file: string): Promise<string> {
        const { stdout } = await execAsync(`git log --follow -- ${file}`);
        return stdout;
    }
}