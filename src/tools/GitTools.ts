import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { tool } from 'ai';
import { ToolContext, ToolNames } from './ToolRegistry.js';
import { ToolExecutionCompletedEvent, ToolExecutionStartedEvent } from '../events/EventTypes.js';

const execAsync = util.promisify(exec);

export const createGitStatusTool = (context: ToolContext) => tool({
    description: 'Get the current git repository status',
    inputSchema: z.object({
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ toolExecutionId }) => {
        const displayTitle = 'GitStatus()';

        // Emit start event
        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.GIT_STATUS,
            toolExecutionId: toolExecutionId!,
            displayTitle,
            displayStatus: 'Checking status...',
        } as ToolExecutionStartedEvent);

        try {
            const { stdout } = await execAsync('git status --porcelain');
            const statusOutput = stdout.trim() || 'Working directory clean';
            const files = stdout.trim() ? stdout.trim().split('\n').map(line => line.substring(3)) : [];

            context.eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName: ToolNames.GIT_STATUS,
                success: true,
                result: { status: statusOutput, files },
                toolExecutionId: toolExecutionId!,
                displayTitle,
                displaySummary: files.length > 0 ? `${files.length} files changed` : 'Working directory clean',
                displayDetails: files.length > 0 ? files.join('\n') : undefined,
            } as ToolExecutionCompletedEvent);

            return {
                success: true,
                data: { status: statusOutput, files },
                filesChanged: files.length
            };
        } catch (error) {
            context.eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName: ToolNames.GIT_STATUS,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                toolExecutionId: toolExecutionId!,
                displayTitle,
                displaySummary: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            } as ToolExecutionCompletedEvent);

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
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ count, toolExecutionId }) => {
        const displayTitle = `GitLog(${count})`;

        // Emit start event
        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.GIT_LOG,
            toolExecutionId: toolExecutionId!,
            displayTitle,
            displayStatus: 'Fetching commits...',
        } as ToolExecutionStartedEvent);

        try {
            const { stdout } = await execAsync(`git log --oneline -${count}`);
            const commits = stdout.trim().split('\n').filter(line => line.length > 0);

            context.eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName: ToolNames.GIT_LOG,
                success: true,
                result: commits,
                toolExecutionId: toolExecutionId!,
                displayTitle,
                displaySummary: `Retrieved ${commits.length} recent commits`,
                displayDetails: commits.join('\n'),
            } as ToolExecutionCompletedEvent);

            return {
                success: true,
                data: commits,
                commitCount: commits.length
            };
        } catch (error) {
            context.eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName: ToolNames.GIT_LOG,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                toolExecutionId: toolExecutionId!,
                displayTitle,
                displaySummary: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            } as ToolExecutionCompletedEvent);

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
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ file, toolExecutionId }) => {
        const displayTitle = `GitDiff(${file || 'all'})`;

        // Emit start event
        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.GIT_DIFF,
            toolExecutionId: toolExecutionId!,
            displayTitle,
            displayStatus: 'Generating diff...',
        } as ToolExecutionStartedEvent);

        try {
            const command = file ? `git diff ${file}` : 'git diff';
            const { stdout } = await execAsync(command);
            const diffOutput = stdout.trim() || 'No changes';
            const linesChanged = diffOutput === 'No changes' ? 0 :
                diffOutput.split('\n').filter(line => line.startsWith('+') || line.startsWith('-')).length;

            context.eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName: ToolNames.GIT_DIFF,
                success: true,
                result: diffOutput,
                toolExecutionId: toolExecutionId!,
                displayTitle,
                displaySummary: linesChanged > 0
                    ? `${linesChanged} lines changed${file ? ` in ${file}` : ''}`
                    : 'No changes',
                displayDetails: diffOutput !== 'No changes' ? diffOutput : undefined,
            } as ToolExecutionCompletedEvent);

            return {
                success: true,
                data: diffOutput,
                linesChanged,
                file: file || 'all files'
            };
        } catch (error) {
            context.eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName: ToolNames.GIT_DIFF,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                toolExecutionId: toolExecutionId!,
                displayTitle,
                displaySummary: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            } as ToolExecutionCompletedEvent);

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: 'No changes'
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