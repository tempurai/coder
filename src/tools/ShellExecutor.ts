import { exec, type ExecOptions } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { tool } from 'ai';
import { CommandValidator, type CommandValidationResult } from '../security/CommandValidator.js';
import { ToolContext } from './base.js';
import { ToolOutputEvent } from '../events/EventTypes.js';

const execAsync = util.promisify(exec);

export const createShellExecutorTools = (context: ToolContext) => {
    const validator = new CommandValidator(context.configLoader);

    const validateCommands = (
        commands: string[],
    ): CommandValidationResult[] =>
        (validator as any).validateCommands
            ? (validator as any).validateCommands(commands)
            : commands.map((c) => validator.validateCommand(c));

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
        }),
        execute: async ({
            command,
            description,
            workingDirectory,
            timeout,
            captureError,
        }) => {
            try {
                const validationResult: CommandValidationResult = validator.validateCommand(command);
                if (!validationResult.allowed) {
                    return {
                        success: false as const,
                        error: `Security policy violation: ${validationResult.reason}`,
                        stdout: '',
                        stderr: '',
                        command,
                        description,
                        cancelled: false,
                        securityBlocked: true,
                        suggestion: validationResult.suggestion,
                    };
                }

                const confirmDescription = `Execute command: ${command}\n${description ? `Purpose: ${description}` : ''}`;
                const confirmed = await context.hitlManager.requestConfirmation(
                    'shell_executor',
                    { command, description, workingDirectory },
                    confirmDescription
                );

                if (!confirmed) {
                    return {
                        success: false as const,
                        error: 'Command execution cancelled by user',
                        stdout: '',
                        stderr: '',
                        command,
                        description,
                        cancelled: true,
                    };
                }

                context.eventEmitter.emit({
                    type: 'tool_output',
                    toolName: 'shell_executor',
                    content: `Executing: ${command}\nPurpose: ${description}`
                } as ToolOutputEvent);

                const options: ExecOptions = { timeout };
                if (workingDirectory) options.cwd = workingDirectory;

                let { stdout, stderr } = await execAsync(command, options);
                stdout = stdout.toString();
                stderr = stderr.toString();

                const outputContent = [
                    `Command: ${command}`,
                    workingDirectory ? `Directory: ${workingDirectory}` : '',
                    stdout ? `Output:\n${stdout.trim()}` : '',
                    (stderr && captureError) ? `Errors:\n${stderr.trim()}` : ''
                ].filter(Boolean).join('\n');

                context.eventEmitter.emit({
                    type: 'tool_output',
                    toolName: 'shell_executor',
                    content: outputContent
                } as ToolOutputEvent);

                return {
                    success: true as const,
                    stdout: stdout?.toString()?.trim() || '',
                    stderr: captureError ? stderr?.toString()?.trim() || '' : '',
                    command,
                    description,
                    workingDirectory: workingDirectory || process.cwd(),
                };
            } catch (error: any) {
                const errorContent = [
                    `Command failed: ${command}`,
                    `Error: ${error?.message ?? String(error)}`,
                    error?.stdout ? `Stdout: ${error.stdout.toString().trim()}` : '',
                    error?.stderr ? `Stderr: ${error.stderr.toString().trim()}` : ''
                ].filter(Boolean).join('\n');

                context.eventEmitter.emit({
                    type: 'tool_output',
                    toolName: 'shell_executor',
                    content: errorContent
                } as ToolOutputEvent);

                return {
                    success: false as const,
                    error: error?.message ?? String(error),
                    stdout: error?.stdout?.toString()?.trim() || '',
                    stderr: error?.stderr?.toString()?.trim() || '',
                    command,
                    description,
                    exitCode: error?.code,
                    cancelled: false,
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
        }),
        execute: async ({
            commands,
            workingDirectory,
            stopOnFirstError,
        }) => {
            const validationResults = validateCommands(commands.map((c) => c.command));
            const blockedCommands = validationResults
                .map((res, idx) => ({ res, idx, original: commands[idx] }))
                .filter((item) => !item.res.allowed);

            if (blockedCommands.length > 0) {
                const blockedList = blockedCommands
                    .map((item) =>
                        `- ${item.original.command}: ${item.res.reason}${item.res.suggestion ? ` (Suggestion: ${item.res.suggestion})` : ''
                        }`,
                    )
                    .join('\n');
                return {
                    success: false as const,
                    results: [],
                    summary: `Security policy violations detected:\n${blockedList}`,
                    workingDirectory: workingDirectory || process.cwd(),
                    cancelled: false,
                    securityBlocked: true,
                };
            }

            const commandsList = commands.slice(0, 3).map(cmd => cmd.command).join(', ');
            const moreCount = commands.length - 3;
            const confirmDescription = `Execute ${commands.length} commands: ${commandsList}${moreCount > 0 ? ` and ${moreCount} more` : ''}`;

            const confirmed = await context.hitlManager.requestConfirmation(
                'multi_command',
                { commands, workingDirectory, stopOnFirstError },
                confirmDescription
            );

            if (!confirmed) {
                return {
                    success: false as const,
                    results: [],
                    summary: 'Multi-command execution cancelled by user',
                    workingDirectory: workingDirectory || process.cwd(),
                    cancelled: true,
                };
            }

            const results: Array<{
                command: string;
                description: string;
                success: boolean;
                stdout: string;
                stderr: string;
                cancelled: boolean;
                error?: string;
                exitCode?: number;
            }> = [];

            context.eventEmitter.emit({
                type: 'tool_output',
                toolName: 'multi_command',
                content: `Executing ${commands.length} commands in sequence${workingDirectory ? ` in ${workingDirectory}` : ''}`
            } as ToolOutputEvent);

            for (let i = 0; i < commands.length; i++) {
                const { command, description, continueOnError } = commands[i];

                context.eventEmitter.emit({
                    type: 'tool_output',
                    toolName: 'multi_command',
                    content: `[${i + 1}/${commands.length}] ${command}\n${description}`
                } as ToolOutputEvent);

                try {
                    const options: ExecOptions = { timeout: 30000 };
                    if (workingDirectory) options.cwd = workingDirectory;

                    let { stdout, stderr } = await execAsync(command, options);
                    stdout = stdout.toString();
                    stderr = stderr.toString();

                    results.push({
                        command,
                        description,
                        success: true,
                        stdout: stdout?.toString()?.trim() || '',
                        stderr: stderr?.toString()?.trim() || '',
                        cancelled: false,
                    });

                    if (stdout) {
                        context.eventEmitter.emit({
                            type: 'tool_output',
                            toolName: 'multi_command',
                            content: `[${i + 1}/${commands.length}] Output:\n${stdout.trim()}`
                        } as ToolOutputEvent);
                    }

                    if (stderr && !continueOnError) {
                        context.eventEmitter.emit({
                            type: 'tool_output',
                            toolName: 'multi_command',
                            content: `[${i + 1}/${commands.length}] Stderr: ${stderr.trim()}`
                        } as ToolOutputEvent);
                    }
                } catch (error: any) {
                    results.push({
                        command,
                        description,
                        success: false,
                        error: error?.message ?? String(error),
                        stdout: error?.stdout?.toString()?.trim() || '',
                        stderr: error?.stderr?.toString()?.trim() || '',
                        exitCode: error?.code,
                        cancelled: false,
                    });

                    context.eventEmitter.emit({
                        type: 'tool_output',
                        toolName: 'multi_command',
                        content: `[${i + 1}/${commands.length}] Failed: ${error?.message ?? error}`
                    } as ToolOutputEvent);

                    if (stopOnFirstError && !continueOnError) {
                        context.eventEmitter.emit({
                            type: 'tool_output',
                            toolName: 'multi_command',
                            content: 'Stopping execution due to error'
                        } as ToolOutputEvent);
                        break;
                    }
                }
            }

            const successCount = results.filter((r) => r.success).length;
            const totalCount = results.length;
            const summaryContent = `Multi-command execution completed:
- ${successCount}/${totalCount} commands successful
- ${totalCount - successCount} commands failed`;

            context.eventEmitter.emit({
                type: 'tool_output',
                toolName: 'multi_command',
                content: summaryContent
            } as ToolOutputEvent);

            return {
                success: successCount === totalCount,
                results,
                summary: `Executed ${totalCount} commands, ${successCount} successful, ${totalCount - successCount
                    } failed`,
                workingDirectory: workingDirectory || process.cwd(),
                cancelled: false,
            };
        },
    });

    return { execute, multiCommand };
};