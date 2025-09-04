import { exec, type ExecOptions } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { tool } from 'ai';
import { ToolContext, ToolNames } from './ToolRegistry.js';
import { ToolExecutionStartedEvent, ToolExecutionOutputEvent, ToolExecutionCompletedEvent, SystemInfoEvent } from '../events/EventTypes.js';
import { ToolExecutionResult } from './ToolRegistry.js';

const execAsync = util.promisify(exec);

interface ShellExecutionResult extends ToolExecutionResult {
    command: string;
    description: string;
    cancelled: boolean;
    commandClassification?: any;
    exitCode?: number;
    workingDirectory?: string;
    securityBlocked?: boolean;
    suggestion?: string;
}

interface MultiCommandResult {
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

interface MultiCommandExecutionResult extends ToolExecutionResult {
    results: MultiCommandResult[];
    summary: string;
    workingDirectory: string;
    cancelled: boolean;
    securityBlocked?: boolean;
}

const generateSubExecutionId = (baseId: string, index: number): string => {
    return `${baseId}_sub_${index}_${Date.now()}`;
};

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
                            return {
                                error: 'Command execution cancelled by user',
                                command,
                                description,
                                cancelled: true,
                                commandClassification: classification,
                                displayDetails: 'Command execution cancelled by user',
                            };
                        }
                    } else {
                        // 发送系统级错误
                        context.eventEmitter.emit({
                            type: 'system_info',
                            level: 'error',
                            source: 'tool',
                            sourceId: toolExecutionId!,
                            message: `Security blocked: ${validationResult.reason}`
                        } as SystemInfoEvent);

                        return {
                            error: `Security blocked: ${validationResult.reason}`,
                            command,
                            description,
                            cancelled: false,
                            securityBlocked: true,
                            suggestion: validationResult.suggestion,
                            commandClassification: classification,
                            displayDetails: `Security blocked: ${validationResult.reason}`
                        };
                    }
                }

                const options: ExecOptions = { timeout };
                if (workingDirectory) options.cwd = workingDirectory;

                // Send output event showing execution
                context.eventEmitter.emit({
                    type: 'tool_execution_output',
                    toolExecutionId: toolExecutionId!,
                    content: `Executing: ${command}`,
                    phase: 'executing',
                } as ToolExecutionOutputEvent);

                let { stdout, stderr } = await execAsync(command, options);
                stdout = stdout.toString();
                stderr = stderr.toString();

                // Format output for display
                let displayContent = '';
                if (stdout) {
                    displayContent += stdout.trim();
                }
                if (stderr && captureError) {
                    if (displayContent) displayContent += '\n';
                    displayContent += `[stderr] ${stderr.trim()}`;
                }

                return {
                    result: {
                        stdout: stdout?.trim() || '',
                        stderr: captureError ? stderr?.trim() || '' : '',
                        exitCode: 0,
                    },
                    command,
                    description,
                    cancelled: false,
                    workingDirectory: workingDirectory || process.cwd(),
                    commandClassification: classification,
                    displayDetails: displayContent || 'Command executed successfully',
                };
            } catch (error: any) {
                // 发送工具错误事件
                context.eventEmitter.emit({
                    type: 'system_info',
                    level: 'error',
                    source: 'tool',
                    sourceId: toolExecutionId!,
                    message: error?.message ?? String(error)
                } as SystemInfoEvent);

                const classification = context.securityEngine.classifyCommand(command);
                const errorMessage = error?.message ?? String(error);
                let displayContent = errorMessage;
                if (error?.stdout) displayContent += `\n${error.stdout.trim()}`;
                if (error?.stderr) displayContent += `\n[stderr] ${error.stderr.trim()}`;

                return {
                    error: errorMessage,
                    command,
                    description,
                    cancelled: false,
                    exitCode: error?.code,
                    commandClassification: classification,
                    displayDetails: displayContent,
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

            // Emit main start event
            context.eventEmitter.emit({
                type: 'tool_execution_started',
                toolName: ToolNames.MULTI_COMMAND,
                args: { commands, workingDirectory, stopOnFirstError },
                toolExecutionId: toolExecutionId!,
                displayTitle,
            } as ToolExecutionStartedEvent);

            if (blockedCommands.length > 0) {
                const blockedList = blockedCommands
                    .map((item) =>
                        `${item.original.command}: ${item.res.reason}${item.res.suggestion ? ` (Suggestion: ${item.res.suggestion})` : ''}`
                    )
                    .join(', ');

                context.eventEmitter.emit({
                    type: 'system_info',
                    level: 'error',
                    source: 'tool',
                    sourceId: toolExecutionId!,
                    message: `Security policy violations: ${blockedList}`
                } as SystemInfoEvent);

                return {
                    error: 'Security policy violations detected: ',
                    results: [],
                    summary: `Security policy violations detected: ${blockedList}`,
                    workingDirectory: workingDirectory || process.cwd(),
                    cancelled: false,
                    securityBlocked: true,
                    displayDetails: blockedList,
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
                return {
                    result: { cancelled: true },
                    results: [],
                    summary: 'Multi-command execution cancelled by user',
                    workingDirectory: workingDirectory || process.cwd(),
                    cancelled: true,
                    displayDetails: 'Multi-command execution cancelled by user',
                };
            }

            const results: MultiCommandResult[] = [];

            // Execute each command with its own execution ID
            for (let i = 0; i < commands.length; i++) {
                const { command, description, continueOnError } = commands[i];
                const subExecutionId = generateSubExecutionId(toolExecutionId!, i);

                // Emit start event for each sub-command
                context.eventEmitter.emit({
                    type: 'tool_execution_started',
                    toolName: ToolNames.SHELL_EXECUTOR,
                    args: { command, description, workingDirectory },
                    toolExecutionId: subExecutionId,
                    displayTitle: `Bash(${command})`,
                } as ToolExecutionStartedEvent);

                // Send progress update for main command
                context.eventEmitter.emit({
                    type: 'tool_execution_output',
                    toolExecutionId: toolExecutionId!,
                    content: `Executing command ${i + 1}/${commands.length}: ${command}`,
                    phase: `command-${i + 1}`,
                } as ToolExecutionOutputEvent);

                try {
                    const options: ExecOptions = { timeout: 30000 };
                    if (workingDirectory) options.cwd = workingDirectory;

                    let { stdout, stderr } = await execAsync(command, options);
                    const classification = context.securityEngine.classifyCommand(command);

                    stdout = stdout.toString();
                    stderr = stderr.toString();

                    const result: MultiCommandResult = {
                        command,
                        description,
                        success: true,
                        stdout: stdout?.trim() || '',
                        stderr: stderr?.trim() || '',
                        cancelled: false,
                        commandClassification: classification,
                    };

                    results.push(result);

                    // Emit completion event for sub-command
                    context.eventEmitter.emit({
                        type: 'tool_execution_completed',
                        toolName: ToolNames.SHELL_EXECUTOR,
                        success: true,
                        result: {
                            stdout: stdout?.trim() || '',
                            stderr: stderr?.trim() || '',
                            exitCode: 0,
                        },
                        toolExecutionId: subExecutionId,
                        displayDetails: stdout?.trim() || 'Command executed successfully',
                    } as ToolExecutionCompletedEvent);
                } catch (error: any) {
                    // 发送工具错误事件
                    context.eventEmitter.emit({
                        type: 'system_info',
                        level: 'error',
                        source: 'tool',
                        sourceId: subExecutionId,
                        message: error?.message ?? String(error)
                    } as SystemInfoEvent);

                    const classification = context.securityEngine.classifyCommand(command);
                    const errorMsg = error?.message ?? String(error);
                    const result: MultiCommandResult = {
                        command,
                        description,
                        success: false,
                        error: errorMsg,
                        stdout: error?.stdout?.toString()?.trim() || '',
                        stderr: error?.stderr?.toString()?.trim() || '',
                        exitCode: error?.code,
                        cancelled: false,
                        commandClassification: classification,
                    };

                    results.push(result);

                    // 发送failure事件给子命令
                    context.eventEmitter.emit({
                        type: 'tool_execution_completed',
                        toolName: ToolNames.SHELL_EXECUTOR,
                        success: true,
                        result: { exitCode: error?.code || 1 },
                        toolExecutionId: subExecutionId,
                        displayDetails: `Command failed: ${command}`,
                    } as ToolExecutionCompletedEvent);

                    if (stopOnFirstError && !continueOnError) {
                        break;
                    }
                }
            }

            const successCount = results.filter((r) => r.success).length;
            const totalCount = results.length;
            const summary = `Executed ${totalCount} commands, ${successCount} successful, ${totalCount - successCount} failed`;

            return {
                result: { results, successCount, totalCount },
                results,
                summary,
                workingDirectory: workingDirectory || process.cwd(),
                cancelled: false,
                displayDetails: summary,
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