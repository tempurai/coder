import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { tool } from 'ai';
import { ToolContext, ToolNames } from './ToolRegistry.js';
import { ToolExecutionStartedEvent, SystemInfoEvent } from '../events/EventTypes.js';
import { ToolExecutionResult } from './ToolRegistry.js';

const execAsync = util.promisify(exec);

export const createGitStatusTool = (context: ToolContext) => tool({
    description: 'Get the current git repository status',
    inputSchema: z.object({
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ toolExecutionId }): Promise<ToolExecutionResult> => {
        const displayTitle = `GitStatus()`;

        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.GIT_STATUS,
            toolExecutionId: toolExecutionId!,
            displayTitle,
        } as ToolExecutionStartedEvent);

        try {
            const { stdout } = await execAsync('git status --porcelain');
            const statusOutput = stdout.trim() || 'Working directory clean';
            const files = stdout.trim() ? stdout.trim().split('\n').map(line => line.substring(3)) : [];

            return {
                result: { status: statusOutput, files, filesChanged: files.length },
                displayDetails: files.length > 0 ? files.join('\n') : 'Working directory clean',
            };
        } catch (error) {
            context.eventEmitter.emit({
                type: 'system_info',
                level: 'error',
                source: 'tool',
                sourceId: toolExecutionId!,
                message: `Git status failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            } as SystemInfoEvent);

            return {
                result: null,
                displayDetails: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
});

export const createGitLogTool = (context: ToolContext) => tool({
    description: 'Get recent commit history',
    inputSchema: z.object({
        count: z.number().default(10).describe('Number of commits to show'),
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ count, toolExecutionId }): Promise<ToolExecutionResult> => {
        const displayTitle = `GitLog(${count})`;

        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.GIT_LOG,
            toolExecutionId: toolExecutionId!,
            displayTitle,
        } as ToolExecutionStartedEvent);

        try {
            const { stdout } = await execAsync(`git log --oneline -${count}`);
            const commits = stdout.trim().split('\n').filter(line => line.length > 0);

            return {
                result: { commits, commitCount: commits.length },
                displayDetails: commits.join('\n'),
            };
        } catch (error) {
            context.eventEmitter.emit({
                type: 'system_info',
                level: 'error',
                source: 'tool',
                sourceId: toolExecutionId!,
                message: `Git log failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            } as SystemInfoEvent);

            return {
                result: null,
                displayDetails: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
});

export const createGitDiffTool = (context: ToolContext) => tool({
    description: 'Show changes in working directory',
    inputSchema: z.object({
        file: z.string().optional().describe('Specific file to show diff for'),
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ file, toolExecutionId }): Promise<ToolExecutionResult> => {
        const displayTitle = `GitDiff(${file || 'all'})`;

        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.GIT_DIFF,
            toolExecutionId: toolExecutionId!,
            displayTitle,
        } as ToolExecutionStartedEvent);

        try {
            const command = file ? `git diff ${file}` : 'git diff';
            const { stdout } = await execAsync(command);
            const diffOutput = stdout.trim() || 'No changes';
            const linesChanged = diffOutput === 'No changes' ? 0 :
                diffOutput.split('\n').filter(line => line.startsWith('+') || line.startsWith('-')).length;

            return {
                result: { diff: diffOutput, linesChanged, file: file || 'all files' },
                displayDetails: diffOutput,
            };
        } catch (error) {
            context.eventEmitter.emit({
                type: 'system_info',
                level: 'error',
                source: 'tool',
                sourceId: toolExecutionId!,
                message: `Git diff failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            } as SystemInfoEvent);

            return {
                result: null,
                displayDetails: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
});

export const registerGitTools = (registry: any) => {
    const context = registry.getContext();
    registry.registerMultiple([
        { name: ToolNames.GIT_STATUS, tool: createGitStatusTool(context), category: 'git' },
        { name: ToolNames.GIT_LOG, tool: createGitLogTool(context), category: 'git' },
        { name: ToolNames.GIT_DIFF, tool: createGitDiffTool(context), category: 'git' }
    ]);
};
