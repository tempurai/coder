import { exec, type ExecOptions } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { CommandValidator, type CommandValidationResult } from '../security/CommandValidator';
import { ConfigLoader } from '../config/ConfigLoader';
import * as readline from 'readline';

const execAsync = util.promisify(exec);

/**
 * 简单的用户确认函数
 */
async function getUserConfirmation(message: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${message} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

/**
 * 创建 Shell 执行器工具
 * @param configLoader 配置加载器实例
 * @returns Shell 执行器工具对象
 */
export const createShellExecutorTool = (configLoader: ConfigLoader) => {
    const validator = new CommandValidator(configLoader);

    // 兼容: 如果没有批量校验函数，则用单条校验拼装
    const validateCommands = (
        commands: string[],
    ): CommandValidationResult[] =>
        (validator as any).validateCommands
            ? (validator as any).validateCommands(commands)
            : commands.map((c) => validator.validateCommand(c));

    return {
        /** 单条命令执行器 */
        execute: {
            id: 'shell_executor',
            name: 'Shell Executor',
            description: `Execute shell commands directly. This is the PRIMARY tool for most operations.

Use this for:
- Git operations: git status, git add, git commit, git diff
- File operations: find, grep, ls, cat, mkdir
- Code analysis: tsc --noEmit, npm run lint, npm test
- Package management: npm install, pnpm add
- Any system command that helps with development

IMPORTANT: Always explain what command you're running and why.`,
            parameters: z.object({
                command: z.string().describe('The shell command to execute'),
                description: z
                    .string()
                    .describe('Brief explanation of what this command does and why'),
                workingDirectory: z
                    .string()
                    .optional()
                    .describe('Directory to execute command in (default: current)'),
                timeout: z.number().default(30000).describe('Timeout in milliseconds'),
                captureError: z
                    .boolean()
                    .default(true)
                    .describe('Whether to capture and return stderr'),
            }),
            execute: async ({
                command,
                description,
                workingDirectory,
                timeout,
                captureError,
            }: {
                command: string;
                description: string;
                workingDirectory?: string;
                timeout: number;
                captureError: boolean;
            }) => {
                try {
                    // 1) 安全验证
                    const validationResult: CommandValidationResult =
                        validator.validateCommand(command);

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

                    // 2) 用户确认（风险分级更保守，包含常见高危写法）
                    const highRiskSet = new Set(['sudo', 'rm', 'dd', 'chmod', 'chown']);
                    const riskLevel: 'high' | 'medium' =
                        validationResult.command && highRiskSet.has(validationResult.command)
                            ? 'high'
                            : 'medium';

                    const confirmed = await getUserConfirmation(
                        `Execute command: ${command}\nPurpose: ${description}`
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

                    console.log(`🔧 Executing: ${command}`);
                    console.log(`📝 Purpose: ${description}`);

                    const options: ExecOptions = { timeout };
                    if (workingDirectory) options.cwd = workingDirectory;

                    const { stdout, stderr } = await execAsync(command, options);

                    return {
                        success: true as const,
                        stdout: stdout?.toString()?.trim() || '',
                        stderr: captureError ? stderr?.toString()?.trim() || '' : '',
                        command,
                        description,
                        workingDirectory: workingDirectory || process.cwd(),
                    };
                } catch (error: any) {
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
        },

        /** 多条命令顺序执行 */
        multiCommand: {
            id: 'multi_command',
            name: 'Multi Command Executor',
            description: `Execute multiple shell commands in sequence. Use this for complex workflows.

Examples:
- Build and test: ["npm run build", "npm test"]
- Git workflow: ["git add .", "git commit -m 'message'", "git push"]
- Setup project: ["mkdir src", "npm init -y", "npm install typescript"]`,
            parameters: z.object({
                commands: z
                    .array(
                        z.object({
                            command: z.string().describe('Shell command to execute'),
                            description: z.string().describe('What this command does'),
                            continueOnError: z
                                .boolean()
                                .default(false)
                                .describe('Whether to continue if this command fails'),
                        }),
                    )
                    .describe('Array of commands to execute in sequence'),
                workingDirectory: z
                    .string()
                    .optional()
                    .describe('Directory to execute commands in'),
                stopOnFirstError: z
                    .boolean()
                    .default(true)
                    .describe('Whether to stop execution on first error'),
            }),
            execute: async ({
                commands,
                workingDirectory,
                stopOnFirstError,
            }: {
                commands: Array<{
                    command: string;
                    description: string;
                    continueOnError: boolean;
                }>;
                workingDirectory?: string;
                stopOnFirstError: boolean;
            }) => {
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

                // 1) 批量安全校验
                const validationResults = validateCommands(commands.map((c) => c.command));
                const blockedCommands = validationResults
                    .map((res, idx) => ({ res, idx, original: commands[idx] }))
                    .filter((item) => !item.res.allowed);

                if (blockedCommands.length > 0) {
                    const blockedList = blockedCommands
                        .map((item) =>
                            `- ${item.original.command}: ${item.res.reason}${item.res.suggestion ? ` (建议: ${item.res.suggestion})` : ''
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

                // 2) 一次性用户确认
                const commandsList = commands
                    .map((cmd, idx) => `${idx + 1}. ${cmd.command} (${cmd.description})`)
                    .join('\n');
                const confirmed = await getUserConfirmation(
                    `Execute ${commands.length} shell commands in sequence?\n\nCommands to execute:\n${commandsList}`
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

                console.log(`🔧 Executing ${commands.length} commands in sequence`);
                if (workingDirectory) console.log(`📁 Working directory: ${workingDirectory}`);

                for (let i = 0; i < commands.length; i++) {
                    const { command, description, continueOnError } = commands[i];
                    console.log(`\n[${i + 1}/${commands.length}] ${command}`);
                    console.log(`📝 ${description}`);

                    try {
                        const options: ExecOptions = { timeout: 30000 };
                        if (workingDirectory) options.cwd = workingDirectory;

                        const { stdout, stderr } = await execAsync(command, options);

                        results.push({
                            command,
                            description,
                            success: true,
                            stdout: stdout?.toString()?.trim() || '',
                            stderr: stderr?.toString()?.trim() || '',
                            cancelled: false,
                        });

                        if (stderr && !continueOnError) {
                            console.log(`⚠️ Command produced stderr: ${stderr}`);
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

                        console.log(`❌ Command failed: ${error?.message ?? error}`);

                        if (stopOnFirstError && !continueOnError) {
                            console.log('🛑 Stopping execution due to error');
                            break;
                        }
                    }
                }

                const successCount = results.filter((r) => r.success).length;
                const totalCount = results.length;

                return {
                    success: successCount === totalCount,
                    results,
                    summary: `Executed ${totalCount} commands, ${successCount} successful, ${totalCount - successCount
                        } failed`,
                    workingDirectory: workingDirectory || process.cwd(),
                    cancelled: false,
                };
            },
        },
    } as const;
};

/**
 * 向后兼容的 Shell 执行器工具
 * @deprecated 建议使用 createShellExecutorTool(configLoader) 代替
 */
const defaultConfigLoader = new ConfigLoader();
export const shellExecutorTool = createShellExecutorTool(defaultConfigLoader);

/**
 * 向后兼容的多命令工具
 * @deprecated 建议使用 createShellExecutorTool(configLoader).multiCommand 代替
 */
export const multiCommandTool = shellExecutorTool.multiCommand;