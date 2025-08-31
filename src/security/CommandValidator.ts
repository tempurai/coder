import { ConfigLoader, Config } from '../config/ConfigLoader.js';

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

interface CommandPattern {
  command: string;
  readPatterns: string[];
  writePatterns: string[];
  dangerousPatterns: string[];
  defaultType: 'read' | 'write' | 'execute';
}

const BUILT_IN_COMMAND_PATTERNS: CommandPattern[] = [
  {
    command: 'find',
    readPatterns: ['-name', '-type', '-size', '-mtime', '-print', '-ls'],
    writePatterns: ['-delete', '-exec rm', '-exec mv', '-exec cp'],
    dangerousPatterns: ['-delete', '-exec rm'],
    defaultType: 'read'
  },
  {
    command: 'git',
    readPatterns: ['status', 'log', 'diff', 'show', 'branch', 'remote'],
    writePatterns: ['add', 'commit', 'push', 'pull', 'merge', 'checkout', 'reset', 'rebase'],
    dangerousPatterns: ['reset --hard', 'clean -f', 'push --force'],
    defaultType: 'read'
  },
  {
    command: 'npm',
    readPatterns: ['list', 'info', 'view', 'search', 'outdated'],
    writePatterns: ['install', 'uninstall', 'update', 'publish', 'run'],
    dangerousPatterns: ['uninstall', 'publish'],
    defaultType: 'execute'
  },
  {
    command: 'docker',
    readPatterns: ['ps', 'images', 'logs', 'inspect', 'version'],
    writePatterns: ['run', 'build', 'push', 'pull', 'rm', 'rmi'],
    dangerousPatterns: ['rm', 'rmi', 'system prune'],
    defaultType: 'execute'
  }
];

const ALWAYS_ALLOWED_COMMANDS = new Set([
  'cat', 'head', 'tail', 'grep', 'less', 'more', 'wc', 'sort', 'uniq',
  'ls', 'pwd', 'whoami', 'date', 'echo', 'which', 'whereis',
  'ps', 'top', 'df', 'du', 'free', 'uname', 'env', 'printenv'
]);

const DANGEROUS_COMMANDS = new Set([
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

export class CommandValidator {
  private config: Config;

  constructor(configLoader: ConfigLoader) {
    this.config = configLoader.getConfig();
  }

  public refreshConfig(configLoader: ConfigLoader): void {
    this.config = configLoader.getConfig();
  }

  public validateCommand(commandLine: string): CommandValidationResult {
    if (!commandLine || typeof commandLine !== 'string') {
      return {
        allowed: false,
        command: '',
        reason: '无效的命令输入'
      };
    }

    const trimmedCommand = commandLine.trim();
    if (trimmedCommand.length === 0) {
      return {
        allowed: false,
        command: '',
        reason: '空命令'
      };
    }

    const rootCommand = this.extractRootCommand(trimmedCommand);
    if (!rootCommand) {
      return {
        allowed: false,
        command: '',
        reason: '无法解析命令'
      };
    }

    const classification = this.classifyCommand(commandLine);
    const securityConfig = this.config.tools.shellExecutor.security;

    // 1. Always allowed commands
    if (ALWAYS_ALLOWED_COMMANDS.has(rootCommand)) {
      return {
        allowed: true,
        command: rootCommand,
        operationType: 'read'
      };
    }

    // 2. Built-in intelligent patterns
    const builtInPattern = BUILT_IN_COMMAND_PATTERNS.find(p => p.command === rootCommand);
    if (builtInPattern) {
      const result = this.validateBuiltInCommand(commandLine, builtInPattern, classification);
      if (result) {
        return result;
      }
    }

    // 3. Check blocklist
    if (this.isInBlocklist(rootCommand, securityConfig.blocklist)) {
      return {
        allowed: false,
        command: rootCommand,
        reason: `命令 '${rootCommand}' 在黑名单中`,
        suggestion: this.getSuggestionForBlockedCommand(rootCommand)
      };
    }

    // 4. Check dangerous commands
    if (DANGEROUS_COMMANDS.has(rootCommand) && !securityConfig.allowDangerousCommands) {
      return {
        allowed: false,
        command: rootCommand,
        reason: `'${rootCommand}' 是危险命令，已被安全策略禁用`,
        suggestion: '如需执行，请在配置中启用 allowDangerousCommands'
      };
    }

    // 5. Check allowlist
    if (this.isInAllowlist(rootCommand, securityConfig.allowlist)) {
      return {
        allowed: true,
        command: rootCommand,
        operationType: classification.operationType
      };
    }

    // 6. Requires user confirmation
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
      reason: `命令 '${rootCommand}' 需要用户确认`,
      operationType: classification.operationType
    };
  }

  public classifyCommand(commandLine: string): CommandClassification {
    const rootCommand = this.extractRootCommand(commandLine);

    if (ALWAYS_ALLOWED_COMMANDS.has(rootCommand)) {
      return {
        isReadOnly: true,
        category: 'read',
        operationType: 'read',
        requiresConfirmation: false
      };
    }

    const pattern = BUILT_IN_COMMAND_PATTERNS.find(p => p.command === rootCommand);
    if (pattern) {
      const hasWritePattern = pattern.writePatterns.some(wp =>
        commandLine.toLowerCase().includes(wp.toLowerCase())
      );

      const hasDangerousPattern = pattern.dangerousPatterns.some(dp =>
        commandLine.toLowerCase().includes(dp.toLowerCase())
      );

      if (hasDangerousPattern) {
        return {
          isReadOnly: false,
          category: 'system',
          operationType: 'write',
          requiresConfirmation: true
        };
      }

      if (hasWritePattern) {
        return {
          isReadOnly: false,
          category: 'write',
          operationType: 'write',
          requiresConfirmation: true
        };
      }

      const hasReadPattern = pattern.readPatterns.some(rp =>
        commandLine.toLowerCase().includes(rp.toLowerCase())
      );

      if (hasReadPattern) {
        return {
          isReadOnly: true,
          category: 'read',
          operationType: 'read',
          requiresConfirmation: false
        };
      }

      // Use default type from pattern
      return {
        isReadOnly: pattern.defaultType === 'read',
        category: pattern.defaultType === 'read' ? 'read' : 'execute',
        operationType: pattern.defaultType,
        requiresConfirmation: pattern.defaultType !== 'read'
      };
    }

    // Default classification for unknown commands
    if (DANGEROUS_COMMANDS.has(rootCommand)) {
      return {
        isReadOnly: false,
        category: 'system',
        operationType: 'execute',
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

  private validateBuiltInCommand(
    commandLine: string,
    pattern: CommandPattern,
    classification: CommandClassification
  ): CommandValidationResult | null {
    const lowerCommand = commandLine.toLowerCase();

    // Check for dangerous patterns first
    for (const dangerousPattern of pattern.dangerousPatterns) {
      if (lowerCommand.includes(dangerousPattern.toLowerCase())) {
        return {
          allowed: false,
          command: pattern.command,
          reason: `命令包含危险操作: ${dangerousPattern}`,
          suggestion: `请避免使用 ${dangerousPattern} 参数`
        };
      }
    }

    // Allow read operations without confirmation
    for (const readPattern of pattern.readPatterns) {
      if (lowerCommand.includes(readPattern.toLowerCase())) {
        return {
          allowed: true,
          command: pattern.command,
          operationType: 'read'
        };
      }
    }

    // Write operations require confirmation
    for (const writePattern of pattern.writePatterns) {
      if (lowerCommand.includes(writePattern.toLowerCase())) {
        return {
          allowed: true,
          command: pattern.command,
          requiresConfirmation: true,
          operationType: 'write'
        };
      }
    }

    // Use default behavior
    return {
      allowed: true,
      command: pattern.command,
      requiresConfirmation: pattern.defaultType !== 'read',
      operationType: pattern.defaultType
    };
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
      'rm': '使用 trash-cli 或类似工具进行安全删除',
      'sudo': '避免使用管理员权限，或在配置中明确启用',
      'chmod': '确认权限更改的必要性',
      'dd': '使用更安全的磁盘工具',
      'kill': '使用进程管理工具或 Ctrl+C 终止进程'
    };

    return suggestions[command.toLowerCase()];
  }

  public validateCommands(commands: string[]): CommandValidationResult[] {
    return commands.map(cmd => this.validateCommand(cmd));
  }

  public validateSecurityConfig(): { warnings: string[]; suggestions: string[] } {
    const securityConfig = this.config.tools.shellExecutor.security;
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (securityConfig.allowUnlistedCommands) {
      warnings.push('允许执行未列出的命令可能存在安全风险');
      suggestions.push('考虑禁用 allowUnlistedCommands 并维护明确的 allowlist');
    }

    if (securityConfig.allowDangerousCommands) {
      warnings.push('允许危险命令可能对系统造成损害');
      suggestions.push('除非必要，否则建议禁用 allowDangerousCommands');
    }

    const dangerousInAllowlist = securityConfig.allowlist.filter(cmd =>
      DANGEROUS_COMMANDS.has(cmd)
    );
    if (dangerousInAllowlist.length > 0) {
      warnings.push(`白名单中包含危险命令: ${dangerousInAllowlist.join(', ')}`);
      suggestions.push('考虑从白名单中移除危险命令，或确保有适当的监控');
    }

    const conflicts = securityConfig.allowlist.filter(cmd =>
      securityConfig.blocklist.includes(cmd)
    );
    if (conflicts.length > 0) {
      warnings.push(`配置冲突: 以下命令同时出现在白名单和黑名单中: ${conflicts.join(', ')}`);
      suggestions.push('解决白名单和黑名单之间的冲突');
    }

    return { warnings, suggestions };
  }
}

export function classifyShellCommand(command: string): CommandClassification {
  // This is a simplified version for backward compatibility
  const validator = new (class {
    classifyCommand(cmd: string) {
      return new CommandValidator({} as any).classifyCommand(cmd);
    }
  })();

  return validator.classifyCommand(command);
}