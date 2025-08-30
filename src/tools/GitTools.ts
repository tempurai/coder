import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { tool } from 'ai';

const execAsync = util.promisify(exec);

export const gitStatusTool = tool({
    description: 'Get the current git repository status',
    inputSchema: z.object({}),
    execute: async () => {
        try {
            const { stdout } = await execAsync('git status --porcelain');
            const statusOutput = stdout.trim() || 'Working directory clean';
            const files = stdout.trim() ? stdout.trim().split('\n').map(line => line.substring(3)) : [];
            return { success: true, data: { status: statusOutput, files } };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: { status: 'Error getting git status', files: [] }
            };
        }
    },
});

export const gitLogTool = tool({
    description: 'Get recent commit history',
    inputSchema: z.object({
        count: z.number().default(10).describe('Number of commits to show'),
    }),
    execute: async ({ count }) => {
        try {
            const { stdout } = await execAsync(`git log --oneline -${count}`);
            const commits = stdout.trim().split('\n').filter(line => line.length > 0);
            return { success: true, data: commits };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: []
            };
        }
    },
});

export const gitDiffTool = tool({
    description: 'Show changes in working directory',
    inputSchema: z.object({
        file: z.string().optional().describe('Specific file to show diff for'),
    }),
    execute: async ({ file }) => {
        try {
            const command = file ? `git diff ${file}` : 'git diff';
            const { stdout } = await execAsync(command);
            return { success: true, data: stdout.trim() || 'No changes' };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: 'No changes'
            };
        }
    },
});