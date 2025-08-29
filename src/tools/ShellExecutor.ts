import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { globalConfirmationManager } from './ConfirmationManager';
import { CommandValidator, type CommandValidationResult } from '../security/CommandValidator';

const execAsync = util.promisify(exec);

export const shellExecutorTool = {
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
        description: z.string().describe('Brief explanation of what this command does and why'),
        workingDirectory: z.string().optional().describe('Directory to execute command in (default: current)'),
        timeout: z.number().default(30000).describe('Timeout in milliseconds'),
        captureError: z.boolean().default(true).describe('Whether to capture and return stderr'),
    }),
    execute: async ({ command, description, workingDirectory, timeout, captureError }: {
        command: string;
        description: string;
        workingDirectory?: string;
        timeout: number;
        captureError: boolean;
    }) => {
        try {
            // 1. 安全验证：检查命令是否被安全策略允许
            const validator = CommandValidator.getInstance();
            const validationResult: CommandValidationResult = validator.validateCommand(command);
            
            if (!validationResult.allowed) {
                return {
                    success: false,
                    error: `Security policy violation: ${validationResult.reason}`,
                    stdout: '',
                    stderr: '',
                    command,
                    description,
                    cancelled: false,
                    securityBlocked: true,
                    suggestion: validationResult.suggestion
                };
            }
            
            // 2. 用户确认：在执行命令前请求用户确认
            const riskLevel = validationResult.command && ['sudo', 'rm', 'dd', 'chmod'].includes(validationResult.command) ? 'high' : 'medium';
            const confirmationAction = await globalConfirmationManager.getUserConfirmation({
                message: `Execute shell command?`,
                command: command,
                riskLevel,
                defaultAction: 'deny'
            });
            
            // 3. 检查用户确认结果
            if (confirmationAction === 'deny') {
                return {
                    success: false,
                    error: 'Command execution cancelled by user',
                    stdout: '',
                    stderr: '',
                    command,
                    description,
                    cancelled: true
                };
            }
            
            console.log(`🔧 Executing: ${command}`);
            console.log(`📝 Purpose: ${description}`);
            
            const options: any = { timeout };
            if (workingDirectory) {
                options.cwd = workingDirectory;
            }
            
            const { stdout, stderr } = await execAsync(command, options);
            
            return {
                success: true,
                stdout: stdout?.toString()?.trim() || '',
                stderr: stderr?.toString()?.trim() || '',
                command,
                description,
                workingDirectory: workingDirectory || process.cwd()
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                stdout: error.stdout?.toString()?.trim() || '',
                stderr: error.stderr?.toString()?.trim() || '',
                command,
                description,
                exitCode: error.code,
                cancelled: false
            };
        }
    },
};

export const multiCommandTool = {
    id: 'multi_command',
    name: 'Multi Command Executor',
    description: `Execute multiple shell commands in sequence. Use this for complex workflows.
    
    Examples:
    - Build and test: ["npm run build", "npm test"]
    - Git workflow: ["git add .", "git commit -m 'message'", "git push"]
    - Setup project: ["mkdir src", "npm init -y", "npm install typescript"]`,
    parameters: z.object({
        commands: z.array(z.object({
            command: z.string().describe('Shell command to execute'),
            description: z.string().describe('What this command does'),
            continueOnError: z.boolean().default(false).describe('Whether to continue if this command fails'),
        })).describe('Array of commands to execute in sequence'),
        workingDirectory: z.string().optional().describe('Directory to execute commands in'),
        stopOnFirstError: z.boolean().default(true).describe('Whether to stop execution on first error'),
    }),
    execute: async ({ commands, workingDirectory, stopOnFirstError }: {
        commands: Array<{command: string; description: string; continueOnError: boolean}>;
        workingDirectory?: string;
        stopOnFirstError: boolean;
    }) => {
        const results = [];
        
        // 1. 安全验证：批量验证所有命令
        const validator = CommandValidator.getInstance();
        const validationResults = validator.validateCommands(commands.map(cmd => cmd.command));
        
        // 检查是否有命令被安全策略阻止
        const blockedCommands = validationResults
            .map((result, index) => ({ result, index, originalCommand: commands[index] }))
            .filter(item => !item.result.allowed);
            
        if (blockedCommands.length > 0) {
            const blockedList = blockedCommands.map(item => 
                `- ${item.originalCommand.command}: ${item.result.reason}${item.result.suggestion ? ` (建议: ${item.result.suggestion})` : ''}`
            ).join('\n');
            
            return {
                success: false,
                results: [],
                summary: `Security policy violations detected:\n${blockedList}`,
                workingDirectory: workingDirectory || process.cwd(),
                cancelled: false,
                securityBlocked: true
            };
        }
        
        // 2. 用户确认：显示所有将要执行的命令并请求确认
        const commandsList = commands.map((cmd, idx) => `${idx + 1}. ${cmd.command} (${cmd.description})`).join('\n');
        const confirmationAction = await globalConfirmationManager.getUserConfirmation({
            message: `Execute ${commands.length} shell commands in sequence?\n\nCommands to execute:\n${commandsList}`,
            riskLevel: 'high',
            defaultAction: 'deny'
        });
        
        // 3. 检查用户确认结果
        if (confirmationAction === 'deny') {
            return {
                success: false,
                results: [],
                summary: `Multi-command execution cancelled by user`,
                workingDirectory: workingDirectory || process.cwd(),
                cancelled: true
            };
        }
        
        console.log(`🔧 Executing ${commands.length} commands in sequence`);
        if (workingDirectory) {
            console.log(`📁 Working directory: ${workingDirectory}`);
        }
        
        for (let i = 0; i < commands.length; i++) {
            const { command, description, continueOnError } = commands[i];
            console.log(`\n[${i + 1}/${commands.length}] ${command}`);
            console.log(`📝 ${description}`);
            
            try {
                const options: any = { timeout: 30000 };
                if (workingDirectory) {
                    options.cwd = workingDirectory;
                }
                
                const { stdout, stderr } = await execAsync(command, options);
                
                const result = {
                    command,
                    description,
                    success: true,
                    stdout: stdout?.toString()?.trim() || '',
                    stderr: stderr?.toString()?.trim() || '',
                    cancelled: false
                };
                
                results.push(result);
                
                if (stderr && !continueOnError) {
                    console.log(`⚠️ Command produced stderr: ${stderr}`);
                }
                
            } catch (error: any) {
                const result = {
                    command,
                    description,
                    success: false,
                    error: error.message,
                    stdout: error.stdout?.toString()?.trim() || '',
                    stderr: error.stderr?.toString()?.trim() || '',
                    exitCode: error.code,
                    cancelled: false
                };
                
                results.push(result);
                console.log(`❌ Command failed: ${error.message}`);
                
                if (stopOnFirstError && !continueOnError) {
                    console.log(`🛑 Stopping execution due to error`);
                    break;
                }
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;
        
        return {
            success: successCount === totalCount,
            results,
            summary: `Executed ${totalCount} commands, ${successCount} successful, ${totalCount - successCount} failed`,
            workingDirectory: workingDirectory || process.cwd(),
            cancelled: false
        };
    },
};