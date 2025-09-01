import { exec, type ExecOptions } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { tool } from 'ai';
import { ToolContext, ToolNames } from './ToolRegistry.js';
import { ToolExecutionCompletedEvent, ToolExecutionStartedEvent } from '../events/EventTypes.js';

const execAsync = util.promisify(exec);

export interface ShellExecutionResult {
    success: boolean;
    stdout?: string;
    stderr?: string;
    command: string;
    description: string;
    cancelled: boolean;
    commandClassification?: any;
    error?: string;
    exitCode?: number;
    workingDirectory?: string;
    securityBlocked?: boolean;
    suggestion?: string;
}

export interface MultiCommandResult {
    command: string;
    description: string;
    success: boolean;
    stdout?: string;
    stderr?: string;
    cancelled: boolean;
    error?: string;
    exitCode?: number;
    commandClassification?: any;
}

export interface MultiCommandExecutionResult {
    success: boolean;
    results: MultiCommandResult[];
    summary: string;
    workingDirectory: string;
    cancelled: boolean;
    securityBlocked?: boolean;
}

export const createShellExecutorTools = (context: ToolContext) => {
    const execute = tool({
        description: `Execute shell commands directly. This is the PRIMARY tool for most operations.
Use this for:
- Git operations: git status, git add, git commit, git diff
- File operations: find, grep, ls, cat, mkdir
- Code analysis: tsc --noEmit, npm run lint, npm test
- Package management: npm install, pnpm add
- Any system command that helps with development
IMPORTANT: Always explain what command you're running and why.`,
        inputSchema: z.object({
            command: z.string().describe('The shell command to execute'),
            description: z.string().describe('Brief explanation of what this command does and why'),
            workingDirectory: z.string().optional().describe('Directory to execute command in (default: current)'),
            timeout: z.number().default(30000).describe('Timeout in milliseconds'),
            captureError: z.boolean().default(true).describe('Whether to capture and return stderr'),
            toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
        }),
        execute: async ({
            command,
            description,
            workingDirectory,
            timeout,
            captureError,
            toolExecutionId,
        }): Promise<ShellExecutionResult> => {
            const displayTitle = `Bash(${command})`;

            try {
                const validationResult = context.securityEngine.validateCommand(command);
                const classification = context.securityEngine.classifyCommand(command);

                // Emit start event
                context.eventEmitter.emit({
                    type: 'tool_execution_started',
                    toolName: ToolNames.SHELL_EXECUTOR,
                    args: { command, description, workingDirectory },
                    toolExecutionId: toolExecutionId!,
                    displayTitle,
                    displayStatus: 'Executing...',
                } as ToolExecutionStartedEvent);

                if (!validationResult.allowed) {
                    if (validationResult.requiresConfirmation) {
                        const confirmed = await context.hitlManager.requestConfirmation(
                            ToolNames.SHELL_EXECUTOR,
                            { command, description, workingDirectory },
                            `Execute command: ${command}\n${description ? `Purpose: ${description}` : ''}`,
                            { showRememberOption: true }
                        );

                        if (!confirmed) {
                            context.eventEmitter.emit({
                                type: 'tool_execution_completed',
                                toolName: ToolNames.SHELL_EXECUTOR,
                                success: false,
                                error: 'Command execution cancelled by user',
                                toolExecutionId: toolExecutionId!,
                                displayTitle,
                                displaySummary: 'Cancelled by user',
                            } as ToolExecutionCompletedEvent);
                            return {
                                success: false,
                                error: 'Command execution cancelled by user',
                                command,
                                description,
                                cancelled: true,
                                commandClassification: classification,
                            };
                        }
                    } else {
                        context.eventEmitter.emit({
                            type: 'tool_execution_completed',
                            toolName: ToolNames.SHELL_EXECUTOR,
                            success: false,
                            error: validationResult.reason,
                            toolExecutionId: toolExecutionId!,
                            displayTitle,
                            displaySummary: `Security blocked: ${validationResult.reason}`,
                        } as ToolExecutionCompletedEvent);
                        return {
                            success: false,
                            error: `Security policy violation: ${validationResult.reason}`,
                            command,
                            description,
                            cancelled: false,
                            securityBlocked: true,
                            suggestion: validationResult.suggestion,
                            commandClassification: classification,
                        };
                    }
                }

                const options: ExecOptions = { timeout };
                if (workingDirectory) options.cwd = workingDirectory;

                let { stdout, stderr } = await execAsync(command, options);
                stdout = stdout.toString();
                stderr = stderr.toString();

                // Generate display summary
                let summary = 'Executed successfully';
                if (stdout) {
                    const lines = stdout.trim().split('\n').length;
                    summary = `Executed successfully (${lines} lines output)`;
                }
                if (stderr && captureError) {
                    summary += ' with warnings';
                }

                context.eventEmitter.emit({
                    type: 'tool_execution_completed',
                    toolName: ToolNames.SHELL_EXECUTOR,
                    success: true,
                    result: { stdout: stdout?.toString()?.trim(), stderr: stderr?.toString()?.trim() },
                    toolExecutionId: toolExecutionId!,
                    displayTitle,
                    displaySummary: summary,
                    displayDetails: stdout?.toString()?.trim(),
                } as ToolExecutionCompletedEvent);

                return {
                    success: true,
                    stdout: stdout?.toString()?.trim() || '',
                    stderr: captureError ? stderr?.toString()?.trim() || '' : '',
                    command,
                    description,
                    cancelled: false,
                    workingDirectory: workingDirectory || process.cwd(),
                    commandClassification: classification,
                };
            } catch (error: any) {
                const classification = context.securityEngine.classifyCommand(command);

                context.eventEmitter.emit({
                    type: 'tool_execution_completed',
                    toolName: ToolNames.SHELL_EXECUTOR,
                    success: false,
                    error: error?.message ?? String(error),
                    toolExecutionId: toolExecutionId!,
                    displayTitle,
                    displaySummary: `Failed: ${error?.message ?? String(error)}`,
                    displayDetails: error?.stdout?.toString()?.trim() || error?.stderr?.toString()?.trim(),
                } as ToolExecutionCompletedEvent);

                return {
                    success: false,
                    error: error?.message ?? String(error),
                    stdout: error?.stdout?.toString()?.trim() || '',
                    stderr: error?.stderr?.toString()?.trim() || '',
                    command,
                    description,
                    cancelled: false,
                    exitCode: error?.code,
                    commandClassification: classification,
                };
            }
        },
    });

    const multiCommand = tool({
        description: `Execute multiple shell commands in sequence. Use this for complex workflows.
Examples:
- Build and test: ["npm run build", "npm test"]
- Git workflow: ["git add .", "git commit -m 'message'", "git push"]
- Setup project: ["mkdir src", "npm init -y", "npm install typescript"]`,
        inputSchema: z.object({
            commands: z.array(
                z.object({
                    command: z.string().describe('Shell command to execute'),
                    description: z.string().describe('What this command does'),
                    continueOnError: z.boolean().default(false).describe('Whether to continue if this command fails'),
                }),
            ).describe('Array of commands to execute in sequence'),
            workingDirectory: z.string().optional().describe('Directory to execute commands in'),
            stopOnFirstError: z.boolean().default(true).describe('Whether to stop execution on first error'),
            toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
        }),
        execute: async ({
            commands,
            workingDirectory,
            stopOnFirstError,
            toolExecutionId,
        }): Promise<MultiCommandExecutionResult> => {
            const displayTitle = `MultiCommand(${commands.length} commands)`;

            const validationResults = commands.map(c => context.securityEngine.validateCommand(c.command));
            const blockedCommands = validationResults
                .map((res, idx) => ({ res, idx, original: commands[idx] }))
                .filter((item) => !item.res.allowed && !item.res.requiresConfirmation);

            // Emit start event
            context.eventEmitter.emit({
                type: 'tool_execution_started',
                toolName: ToolNames.MULTI_COMMAND,
                args: { commands, workingDirectory, stopOnFirstError },
                toolExecutionId: toolExecutionId!,
                displayTitle,
                displayStatus: 'Starting batch execution...',
            } as ToolExecutionStartedEvent);

            if (blockedCommands.length > 0) {
                const blockedList = blockedCommands
                    .map((item) =>
                        `${item.original.command}: ${item.res.reason}${item.res.suggestion ? ` (Suggestion: ${item.res.suggestion})` : ''}`
                    )
                    .join(', ');

                context.eventEmitter.emit({
                    type: 'tool_execution_completed',
                    toolName: ToolNames.MULTI_COMMAND,
                    success: false,
                    error: 'Security policy violations detected',
                    toolExecutionId: toolExecutionId!,
                    displayTitle,
                    displaySummary: `Security blocked: ${blockedCommands.length} commands`,
                    displayDetails: blockedList,
                } as ToolExecutionCompletedEvent);

                return {
                    success: false,
                    results: [],
                    summary: `Security policy violations detected: ${blockedList}`,
                    workingDirectory: workingDirectory || process.cwd(),
                    cancelled: false,
                    securityBlocked: true,
                };
            }

            const commandsList = commands.slice(0, 3).map(cmd => cmd.command).join(', ');
            const moreCount = commands.length - 3;
            const confirmDescription = `Execute ${commands.length} commands: ${commandsList}${moreCount > 0 ? ` and ${moreCount} more` : ''}`;

            const confirmed = await context.hitlManager.requestConfirmation(
                ToolNames.MULTI_COMMAND,
                { commands, workingDirectory, stopOnFirstError },
                confirmDescription,
                { showRememberOption: false }
            );

            if (!confirmed) {
                context.eventEmitter.emit({
                    type: 'tool_execution_completed',
                    toolName: ToolNames.MULTI_COMMAND,
                    success: false,
                    error: 'Multi-command execution cancelled by user',
                    toolExecutionId: toolExecutionId!,
                    displayTitle,
                    displaySummary: 'Cancelled by user',
                } as ToolExecutionCompletedEvent);

                return {
                    success: false,
                    results: [],
                    summary: 'Multi-command execution cancelled by user',
                    workingDirectory: workingDirectory || process.cwd(),
                    cancelled: true,
                };
            }

            const results: MultiCommandResult[] = [];

            for (let i = 0; i < commands.length; i++) {
                const { command, description, continueOnError } = commands[i];

                try {
                    const options: ExecOptions = { timeout: 30000 };
                    if (workingDirectory) options.cwd = workingDirectory;

                    let { stdout, stderr } = await execAsync(command, options);
                    const classification = context.securityEngine.classifyCommand(command);

                    stdout = stdout.toString();
                    stderr = stderr.toString();

                    results.push({
                        command,
                        description,
                        success: true,
                        stdout: stdout?.toString()?.trim() || '',
                        stderr: stderr?.toString()?.trim() || '',
                        cancelled: false,
                        commandClassification: classification,
                    });

                } catch (error: any) {
                    const classification = context.securityEngine.classifyCommand(command);

                    results.push({
                        command,
                        description,
                        success: false,
                        error: error?.message ?? String(error),
                        stdout: error?.stdout?.toString()?.trim() || '',
                        stderr: error?.stderr?.toString()?.trim() || '',
                        exitCode: error?.code,
                        cancelled: false,
                        commandClassification: classification,
                    });

                    if (stopOnFirstError && !continueOnError) {
                        break;
                    }
                }
            }

            const successCount = results.filter((r) => r.success).length;
            const totalCount = results.length;

            context.eventEmitter.emit({
                type: 'tool_execution_completed',
                toolName: ToolNames.MULTI_COMMAND,
                success: successCount === totalCount,
                result: { results, successCount, totalCount },
                toolExecutionId: toolExecutionId!,
                displayTitle,
                displaySummary: `Executed ${totalCount} commands, ${successCount} successful, ${totalCount - successCount} failed`,
                displayDetails: results.map(r => `${r.command}: ${r.success ? 'OK' : r.error}`).join('\n'),
            } as ToolExecutionCompletedEvent);

            return {
                success: successCount === totalCount,
                results,
                summary: `Executed ${totalCount} commands, ${successCount} successful, ${totalCount - successCount} failed`,
                workingDirectory: workingDirectory || process.cwd(),
                cancelled: false,
            };
        },
    });

    return { execute, multiCommand };
};

export const registerShellExecutorTools = (registry: any) => {
    const context = registry.getContext();
    const { execute, multiCommand } = createShellExecutorTools(context);

    registry.registerMultiple([
        { name: ToolNames.SHELL_EXECUTOR, tool: execute, category: 'system' },
        { name: ToolNames.MULTI_COMMAND, tool: multiCommand, category: 'system' }
    ]);
};