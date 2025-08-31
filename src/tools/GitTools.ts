import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { tool } from 'ai';
import { ToolContext } from './base.js';
import { ToolOutputEvent } from '../events/EventTypes.js';

const execAsync = util.promisify(exec);

export const createGitStatusTool = (context: ToolContext) => tool({
    description: 'Get the current git repository status',
    inputSchema: z.object({}),
    execute: async () => {
        try {
            const { stdout } = await execAsync('git status --porcelain');
            const statusOutput = stdout.trim() || 'Working directory clean';
            const files = stdout.trim() ? stdout.trim().split('\n').map(line => line.substring(3)) : [];

            context.eventEmitter.emit({
                type: 'tool_output',
                toolName: 'git_status',
                content: `Repository status: ${files.length > 0 ? `${files.length} files changed` : 'working directory clean'}`
            } as ToolOutputEvent);

            return {
                success: true,
                data: { status: statusOutput, files },
                filesChanged: files.length
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: { status: 'Error getting git status', files: [] }
            };
        }
    },
});

export const createGitLogTool = (context: ToolContext) => tool({
    description: 'Get recent commit history',
    inputSchema: z.object({
        count: z.number().default(10).describe('Number of commits to show'),
    }),
    execute: async ({ count }) => {
        try {
            const { stdout } = await execAsync(`git log --oneline -${count}`);
            const commits = stdout.trim().split('\n').filter(line => line.length > 0);

            context.eventEmitter.emit({
                type: 'tool_output',
                toolName: 'git_log',
                content: `Retrieved ${commits.length} recent commits`
            } as ToolOutputEvent);

            return {
                success: true,
                data: commits,
                commitCount: commits.length
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: []
            };
        }
    },
});

export const createGitDiffTool = (context: ToolContext) => tool({
    description: 'Show changes in working directory',
    inputSchema: z.object({
        file: z.string().optional().describe('Specific file to show diff for'),
    }),
    execute: async ({ file }) => {
        try {
            const command = file ? `git diff ${file}` : 'git diff';
            const { stdout } = await execAsync(command);
            const diffOutput = stdout.trim() || 'No changes';

            const linesChanged = diffOutput === 'No changes' ? 0 :
                diffOutput.split('\n').filter(line => line.startsWith('+') || line.startsWith('-')).length;

            context.eventEmitter.emit({
                type: 'tool_output',
                toolName: 'git_diff',
                content: file
                    ? `Diff for ${file}: ${linesChanged > 0 ? `${linesChanged} lines changed` : 'no changes'}`
                    : `Working directory diff: ${linesChanged > 0 ? `${linesChanged} lines changed` : 'no changes'}`
            } as ToolOutputEvent);

            return {
                success: true,
                data: diffOutput,
                linesChanged,
                file: file || 'all files'
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: 'No changes'
            };
        }
    },
});
