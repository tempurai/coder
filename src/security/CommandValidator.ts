import { ConfigLoader, Config } from '../config/ConfigLoader';

/**
 * 命令验证结果接口
 * 包含验证状态和相关的诊断信息
 */
export interface CommandValidationResult {
  /** 是否允许执行该命令 */
  allowed: boolean;
  /** 提取的根命令 */
  command: string;
  /** 验证失败的原因（如果有） */
  reason?: string;
  /** 建议的替代命令（如果有） */
  suggestion?: string;
}

/**
 * 危险命令列表
 * 这些命令需要特别注意，因为它们可能对系统造成不可逆的损害
 */
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

/**
 * 潜在危险的参数组合
 * 某些命令配合特定参数时具有破坏性
 */
const DANGEROUS_PATTERNS = [
  /rm\s+.*-r.*\//, // rm -r with paths
  /chmod\s+.*777/, // chmod 777
  /find\s+.*-delete/, // find with -delete
  /dd\s+.*of=\/dev/, // dd writing to devices
  />.*\/dev\/null/, // Redirecting to /dev/null (可能隐藏错误)
];

/**
 * 命令验证器类
 * 负责根据配置的安全策略验证shell命令是否允许执行
 */
export class CommandValidator {
  private config: Config;

  /**
   * 构造函数
   * @param configLoader 配置加载器实例
   */
  constructor(configLoader: ConfigLoader) {
    this.config = configLoader.getConfig();
  }

  /**
   * 刷新配置缓存
   * 当配置文件更新后应调用此方法
   */
  public refreshConfig(configLoader: ConfigLoader): void {
    this.config = configLoader.getConfig();
  }

  /**
   * 验证命令是否允许执行
   * 
   * @param commandLine 完整的命令行字符串
   * @returns CommandValidationResult 验证结果
   * 
   * @example
   * ```typescript
   * const validator = CommandValidator.getInstance();
   * const result = validator.validateCommand('git status');
   * if (result.allowed) {
   *   // 执行命令
   * } else {
   *   console.error(`命令被阻止: ${result.reason}`);
   * }
   * ```
   */
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

    // 提取根命令（第一个单词，去除路径）
    const rootCommand = this.extractRootCommand(trimmedCommand);
    
    if (!rootCommand) {
      return {
        allowed: false,
        command: '',
        reason: '无法解析命令'
      };
    }

    // 获取安全配置
    const securityConfig = this.config.tools.shellExecutor.security;

    // 1. 检查黑名单
    if (this.isInBlocklist(rootCommand, securityConfig.blocklist)) {
      return {
        allowed: false,
        command: rootCommand,
        reason: `命令 '${rootCommand}' 在黑名单中`,
        suggestion: this.getSuggestionForBlockedCommand(rootCommand)
      };
    }

    // 2. 检查危险命令
    if (DANGEROUS_COMMANDS.has(rootCommand) && !securityConfig.allowDangerousCommands) {
      return {
        allowed: false,
        command: rootCommand,
        reason: `'${rootCommand}' 是危险命令，已被安全策略禁用`,
        suggestion: '如需执行，请在配置中启用 allowDangerousCommands'
      };
    }

    // 3. 检查危险模式
    const dangerousPattern = this.findDangerousPattern(trimmedCommand);
    if (dangerousPattern && !securityConfig.allowDangerousCommands) {
      return {
        allowed: false,
        command: rootCommand,
        reason: '命令包含危险模式',
        suggestion: '请检查命令参数或在配置中启用 allowDangerousCommands'
      };
    }

    // 4. 检查白名单
    if (this.isInAllowlist(rootCommand, securityConfig.allowlist)) {
      return {
        allowed: true,
        command: rootCommand
      };
    }

    // 5. 检查是否允许未列出的命令
    if (securityConfig.allowUnlistedCommands) {
      return {
        allowed: true,
        command: rootCommand
      };
    }

    // 默认拒绝
    return {
      allowed: false,
      command: rootCommand,
      reason: `命令 '${rootCommand}' 不在允许列表中`,
      suggestion: `请将 '${rootCommand}' 添加到配置文件的 allowlist 中，或启用 allowUnlistedCommands`
    };
  }

  /**
   * 批量验证多个命令
   * 适用于管道命令或脚本验证
   */
  public validateCommands(commands: string[]): CommandValidationResult[] {
    return commands.map(cmd => this.validateCommand(cmd));
  }

  /**
   * 检查配置的安全策略是否合理
   * 返回潜在的安全问题和建议
   */
  public validateSecurityConfig(): { warnings: string[]; suggestions: string[] } {
    const securityConfig = this.config.tools.shellExecutor.security;
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 检查是否允许所有未列出的命令
    if (securityConfig.allowUnlistedCommands) {
      warnings.push('允许执行未列出的命令可能存在安全风险');
      suggestions.push('考虑禁用 allowUnlistedCommands 并维护明确的 allowlist');
    }

    // 检查是否允许危险命令
    if (securityConfig.allowDangerousCommands) {
      warnings.push('允许危险命令可能对系统造成损害');
      suggestions.push('除非必要，否则建议禁用 allowDangerousCommands');
    }

    // 检查白名单中是否有危险命令
    const dangerousInAllowlist = securityConfig.allowlist.filter(cmd => 
      DANGEROUS_COMMANDS.has(cmd)
    );
    if (dangerousInAllowlist.length > 0) {
      warnings.push(`白名单中包含危险命令: ${dangerousInAllowlist.join(', ')}`);
      suggestions.push('考虑从白名单中移除危险命令，或确保有适当的监控');
    }

    // 检查黑名单是否覆盖了白名单中的命令
    const conflicts = securityConfig.allowlist.filter(cmd => 
      securityConfig.blocklist.includes(cmd)
    );
    if (conflicts.length > 0) {
      warnings.push(`配置冲突: 以下命令同时出现在白名单和黑名单中: ${conflicts.join(', ')}`);
      suggestions.push('解决白名单和黑名单之间的冲突');
    }

    return { warnings, suggestions };
  }

  /**
   * 提取命令行中的根命令
   * 处理各种格式：绝对路径、相对路径、别名等
   */
  private extractRootCommand(commandLine: string): string {
    // 移除前导空格并分割参数
    const parts = commandLine.trim().split(/\s+/);
    if (parts.length === 0) return '';

    const firstPart = parts[0];
    
    // 处理路径格式的命令
    const pathSegments = firstPart.split(/[/\\]/);
    const commandName = pathSegments[pathSegments.length - 1];
    
    // 移除文件扩展名（主要针对 Windows）
    return commandName.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
  }

  /**
   * 检查命令是否在白名单中
   */
  private isInAllowlist(command: string, allowlist: string[]): boolean {
    return allowlist.some(allowed => 
      allowed.toLowerCase() === command.toLowerCase()
    );
  }

  /**
   * 检查命令是否在黑名单中
   */
  private isInBlocklist(command: string, blocklist: string[]): boolean {
    return blocklist.some(blocked => 
      blocked.toLowerCase() === command.toLowerCase()
    );
  }

  /**
   * 查找命令中的危险模式
   */
  private findDangerousPattern(commandLine: string): RegExp | null {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(commandLine)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * 为被阻止的命令提供建议
   */
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
}

/**
 * 便捷的全局验证函数
 * 提供快速的命令验证访问
 * @deprecated 建议直接使用 CommandValidator 实例
 */
export function validateCommand(commandLine: string, configLoader: ConfigLoader): CommandValidationResult {
  const validator = new CommandValidator(configLoader);
  return validator.validateCommand(commandLine);
}

/**
 * 便捷的批量验证函数
 * @deprecated 建议直接使用 CommandValidator 实例
 */
export function validateCommands(commands: string[], configLoader: ConfigLoader): CommandValidationResult[] {
  const validator = new CommandValidator(configLoader);
  return validator.validateCommands(commands);
}