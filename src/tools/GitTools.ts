import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';

const execAsync = util.promisify(exec);

export const gitStatusTool = {
    id: 'git_status',
    name: 'Git Status',
    description: 'Get the current git repository status',
    parameters: z.object({}),
    execute: async () => {
        try {
            const { stdout } = await execAsync('git status --porcelain');
            return { success: true, result: stdout.trim() || 'Working directory clean' };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
};

export const gitLogTool = {
    id: 'git_log',
    name: 'Git Log',
    description: 'Get recent commit history',
    parameters: z.object({
        count: z.number().default(10).describe('Number of commits to show'),
    }),
    execute: async ({ count }: { count: number }) => {
        try {
            const { stdout } = await execAsync(`git log --oneline -${count}`);
            return { success: true, result: stdout.trim() };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
};

export const gitDiffTool = {
    id: 'git_diff',
    name: 'Git Diff',
    description: 'Show changes in working directory',
    parameters: z.object({
        file: z.string().optional().describe('Specific file to show diff for'),
    }),
    execute: async ({ file }: { file?: string }) => {
        try {
            const command = file ? `git diff ${file}` : 'git diff';
            const { stdout } = await execAsync(command);
            return { success: true, result: stdout.trim() || 'No changes' };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
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