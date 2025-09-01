import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { ConfigLoader } from '../config/ConfigLoader.js';

export interface CommandValidationResult {
    allowed: boolean;
    command: string;
    reason?: string;
    suggestion?: string;
    requiresConfirmation?: boolean;
    operationType?: 'read' | 'write' | 'execute';
}

export interface CommandClassification {
    isReadOnly: boolean;
    category: 'read' | 'write' | 'execute' | 'system';
    operationType: 'read' | 'write' | 'execute';
    requiresConfirmation: boolean;
}

@injectable()
export class SecurityPolicyEngine {
    private readonly dangerousCommands = new Set([
        'rm', 'rmdir', 'del', 'deltree',
        'sudo', 'su',
        'chmod', 'chown', 'chgrp',
        'dd', 'format', 'fdisk', 'mkfs',
        'shutdown', 'reboot', 'halt', 'poweroff',
        'kill', 'killall', 'pkill',
        'crontab', 'systemctl', 'service',
        'mount', 'umount', 'fsck',
        'iptables', 'ufw', 'firewall-cmd'
    ]);

    private readonly alwaysAllowedCommands = new Set([
        'cat', 'head', 'tail', 'grep', 'less', 'more', 'wc', 'sort', 'uniq',
        'ls', 'pwd', 'whoami', 'date', 'echo', 'which', 'whereis',
        'ps', 'top', 'df', 'du', 'free', 'uname', 'env', 'printenv'
    ]);

    // 添加write操作命令集合
    private readonly writeOperationCommands = new Set([
        'cp', 'mv', 'mkdir', 'touch', 'tee', 'dd',
        'echo', 'printf', 'sed', 'awk',  // 当使用重定向时
        'git', 'npm', 'yarn', 'pnpm',    // 可能修改文件
        'node', 'python', 'pip',         // 可能修改文件
        'make', 'cmake', 'gcc', 'javac', // 编译可能生成文件
        'tar', 'zip', 'unzip', 'gzip',   // 压缩解压可能修改文件
    ]);

    constructor(
        @inject(TYPES.ConfigLoader) private configLoader: ConfigLoader
    ) { }

    validateCommand(commandLine: string): CommandValidationResult {
        if (!commandLine || typeof commandLine !== 'string') {
            return {
                allowed: false,
                command: '',
                reason: 'Invalid command input'
            };
        }

        const trimmedCommand = commandLine.trim();
        if (trimmedCommand.length === 0) {
            return {
                allowed: false,
                command: '',
                reason: 'Empty command'
            };
        }

        const rootCommand = this.extractRootCommand(trimmedCommand);
        if (!rootCommand) {
            return {
                allowed: false,
                command: '',
                reason: 'Cannot parse command'
            };
        }

        const classification = this.classifyCommand(commandLine);
        const securityConfig = this.configLoader.getConfig().tools.shellExecutor.security;

        if (this.alwaysAllowedCommands.has(rootCommand)) {
            return {
                allowed: true,
                command: rootCommand,
                operationType: 'read'
            };
        }

        if (this.isInBlocklist(rootCommand, securityConfig.blocklist)) {
            return {
                allowed: false,
                command: rootCommand,
                reason: `Command '${rootCommand}' is blocked`,
                suggestion: this.getSuggestionForBlockedCommand(rootCommand)
            };
        }

        if (this.dangerousCommands.has(rootCommand) && !securityConfig.allowDangerousCommands) {
            return {
                allowed: false,
                command: rootCommand,
                reason: `'${rootCommand}' is a dangerous command`,
                suggestion: 'Enable allowDangerousCommands in config if needed'
            };
        }

        if (this.isInAllowlist(rootCommand, securityConfig.allowlist)) {
            return {
                allowed: true,
                command: rootCommand,
                operationType: classification.operationType
            };
        }

        if (securityConfig.allowUnlistedCommands) {
            return {
                allowed: true,
                command: rootCommand,
                requiresConfirmation: true,
                operationType: classification.operationType
            };
        }

        return {
            allowed: false,
            command: rootCommand,
            requiresConfirmation: true,
            reason: `Command '${rootCommand}' requires confirmation`,
            operationType: classification.operationType
        };
    }

    classifyCommand(commandLine: string): CommandClassification {
        const rootCommand = this.extractRootCommand(commandLine);

        if (this.alwaysAllowedCommands.has(rootCommand)) {
            return {
                isReadOnly: true,
                category: 'read',
                operationType: 'read',
                requiresConfirmation: false
            };
        }

        if (this.dangerousCommands.has(rootCommand)) {
            return {
                isReadOnly: false,
                category: 'system',
                operationType: 'execute',
                requiresConfirmation: true
            };
        }

        // 判断是否为write操作
        if (this.isWriteOperation(commandLine, rootCommand)) {
            return {
                isReadOnly: false,
                category: 'write',
                operationType: 'write',
                requiresConfirmation: true
            };
        }

        return {
            isReadOnly: false,
            category: 'execute',
            operationType: 'execute',
            requiresConfirmation: true
        };
    }

    // 添加方法判断是否为write操作
    isWriteOperation(commandLine: string, rootCommand?: string): boolean {
        const command = rootCommand || this.extractRootCommand(commandLine);

        // 直接的write操作命令
        if (this.writeOperationCommands.has(command)) {
            return true;
        }

        // 检查是否包含重定向操作符，这些通常表示写入文件
        if (/[>&]|>>?|\|/.test(commandLine)) {
            return true;
        }

        // 特殊情况检查
        if (command === 'echo' && commandLine.includes('>')) {
            return true;
        }

        if (command === 'cat' && commandLine.includes('>')) {
            return true;
        }

        return false;
    }

    private extractRootCommand(commandLine: string): string {
        const parts = commandLine.trim().split(/\s+/);
        if (parts.length === 0) return '';
        const firstPart = parts[0];
        const pathSegments = firstPart.split(/[/\\]/);
        const commandName = pathSegments[pathSegments.length - 1];
        return commandName.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
    }

    private isInAllowlist(command: string, allowlist: string[]): boolean {
        return allowlist.some(allowed =>
            allowed.toLowerCase() === command.toLowerCase()
        );
    }

    private isInBlocklist(command: string, blocklist: string[]): boolean {
        return blocklist.some(blocked =>
            blocked.toLowerCase() === command.toLowerCase()
        );
    }

    private getSuggestionForBlockedCommand(command: string): string | undefined {
        const suggestions: Record<string, string> = {
            'rm': 'Use trash-cli or similar for safe deletion',
            'sudo': 'Avoid admin privileges or explicitly enable in config',
            'chmod': 'Confirm necessity of permission changes',
            'dd': 'Use safer disk tools',
            'kill': 'Use process manager or Ctrl+C to terminate'
        };
        return suggestions[command.toLowerCase()];
    }
}