import { Config } from '../ConfigLoader';
import { ValidationResult } from './ModelConfigValidator';

/**
 * 安全配置验证器
 * 负责验证Shell执行器和其他安全策略配置的合理性
 */
export class SecurityConfigValidator {
    private readonly dangerousCommands = [
        'rm', 'del', 'deltree', 'format', 'sudo', 'su',
        'chmod', 'chown', 'dd', 'fdisk', 'mkfs',
        'kill', 'killall', 'pkill', 'shutdown', 'reboot',
        'halt', 'poweroff', 'systemctl', 'service'
    ];

    private readonly commonSafeCommands = [
        'git', 'npm', 'node', 'pnpm', 'yarn', 'ls', 'dir',
        'cat', 'type', 'echo', 'mkdir', 'touch', 'pwd',
        'whoami', 'which', 'where', 'help', 'man',
        'grep', 'find', 'curl', 'wget'
    ];

    /**
     * 验证安全配置
     * @param config 完整配置对象
     * @returns 验证结果
     */
    validate(config: Config): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // 验证Shell执行器安全配置
        this.validateShellExecutorSecurity(config, result);

        // 验证Web工具安全配置
        this.validateWebToolsSecurity(config, result);

        // 验证整体安全策略一致性
        this.validateSecurityPolicyConsistency(config, result);

        return result;
    }

    /**
     * 验证Shell执行器安全配置
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateShellExecutorSecurity(config: Config, result: ValidationResult): void {
        const security = config.tools.shellExecutor.security;

        // 验证白名单
        if (!security.allowlist || security.allowlist.length === 0) {
            if (!security.allowUnlistedCommands) {
                result.errors.push('Shell executor allowlist is empty but allowUnlistedCommands is false - no commands can be executed');
                result.isValid = false;
            } else {
                result.warnings.push('Empty allowlist with allowUnlistedCommands=true may be unsafe');
            }
        }

        // 验证黑名单
        if (!security.blocklist || security.blocklist.length === 0) {
            result.warnings.push('Empty blocklist - consider adding dangerous commands to blocklist');
        }

        // 检查白名单中的危险命令
        const dangerousInAllowlist = security.allowlist.filter(cmd =>
            this.dangerousCommands.some(dangerous =>
                cmd.toLowerCase().includes(dangerous.toLowerCase())
            )
        );

        if (dangerousInAllowlist.length > 0) {
            if (security.allowDangerousCommands) {
                result.warnings.push(`Dangerous commands in allowlist: ${dangerousInAllowlist.join(', ')}`);
            } else {
                result.errors.push(`Dangerous commands in allowlist but allowDangerousCommands=false: ${dangerousInAllowlist.join(', ')}`);
                result.isValid = false;
            }
        }

        // 检查黑名单遗漏的危险命令
        const missingDangerousCommands = this.dangerousCommands.filter(dangerous =>
            !security.blocklist.some(blocked =>
                blocked.toLowerCase().includes(dangerous.toLowerCase())
            )
        );

        if (missingDangerousCommands.length > 0) {
            result.warnings.push(`Consider adding these dangerous commands to blocklist: ${missingDangerousCommands.join(', ')}`);
        }

        // 验证白名单和黑名单冲突
        const conflictingCommands = security.allowlist.filter(allowed =>
            security.blocklist.some(blocked =>
                allowed.toLowerCase() === blocked.toLowerCase()
            )
        );

        if (conflictingCommands.length > 0) {
            result.errors.push(`Commands appear in both allowlist and blocklist: ${conflictingCommands.join(', ')}`);
            result.isValid = false;
        }

        // 建议添加常见安全命令到白名单
        const missingSafeCommands = this.commonSafeCommands.filter(safe =>
            !security.allowlist.some(allowed =>
                allowed.toLowerCase().includes(safe.toLowerCase())
            )
        );

        if (missingSafeCommands.length > 0) {
            result.warnings.push(`Consider adding these safe commands to allowlist: ${missingSafeCommands.slice(0, 5).join(', ')}${missingSafeCommands.length > 5 ? '...' : ''}`);
        }

        // 验证超时配置
        const timeout = config.tools.shellExecutor.defaultTimeout;
        if (timeout < 1000) {
            result.warnings.push('Very short shell timeout may cause commands to fail');
        }
        if (timeout > 300000) { // 5分钟
            result.warnings.push('Very long shell timeout may allow hanging processes');
        }

        // 验证重试配置
        const maxRetries = config.tools.shellExecutor.maxRetries;
        if (maxRetries > 10) {
            result.warnings.push('High retry count may mask configuration issues');
        }
        if (maxRetries < 1) {
            result.warnings.push('Zero retries may cause failures on temporary issues');
        }
    }

    /**
     * 验证Web工具安全配置
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateWebToolsSecurity(config: Config, result: ValidationResult): void {
        const webTools = config.tools.webTools;

        // 验证请求超时
        if (webTools.requestTimeout < 1000) {
            result.warnings.push('Very short web request timeout may cause failures');
        }
        if (webTools.requestTimeout > 60000) {
            result.warnings.push('Very long web request timeout may allow hanging requests');
        }

        // 验证内容长度限制
        if (webTools.maxContentLength < 1000) {
            result.warnings.push('Very small maxContentLength may truncate useful content');
        }
        if (webTools.maxContentLength > 1000000) { // 1MB
            result.warnings.push('Very large maxContentLength may consume excessive memory');
        }

        // 验证用户代理字符串
        if (!webTools.userAgent || webTools.userAgent.trim().length === 0) {
            result.warnings.push('Empty user agent may cause some websites to block requests');
        }
        if (webTools.userAgent.length > 200) {
            result.warnings.push('Very long user agent string may be suspicious to servers');
        }

        // 检查用户代理是否包含敏感信息
        const sensitivePatterns = ['password', 'token', 'key', 'secret'];
        const hasSensitiveInfo = sensitivePatterns.some(pattern =>
            webTools.userAgent.toLowerCase().includes(pattern)
        );
        if (hasSensitiveInfo) {
            result.errors.push('User agent contains sensitive information');
            result.isValid = false;
        }
    }

    /**
     * 验证整体安全策略一致性
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateSecurityPolicyConsistency(config: Config, result: ValidationResult): void {
        const shellSecurity = config.tools.shellExecutor.security;
        const smartDiff = config.tools.smartDiff;

        // 如果允许危险命令但不要求确认，这可能是不安全的
        if (shellSecurity.allowDangerousCommands && !smartDiff.requireConfirmation) {
            result.warnings.push('Allowing dangerous commands without requiring confirmation may be unsafe');
        }

        // 如果允许未列出的命令且允许危险命令，风险很高
        if (shellSecurity.allowUnlistedCommands && shellSecurity.allowDangerousCommands) {
            result.errors.push('Allowing both unlisted commands AND dangerous commands is extremely unsafe');
            result.isValid = false;
        }

        // 检查是否启用了过于宽松的安全策略
        const securityScore = this.calculateSecurityScore(config);
        if (securityScore < 3) {
            result.errors.push('Security configuration is too permissive - please review settings');
            result.isValid = false;
        } else if (securityScore < 5) {
            result.warnings.push('Security configuration could be improved');
        }
    }

    /**
     * 计算安全分数（0-10，10最安全）
     * @param config 完整配置
     * @returns 安全分数
     */
    private calculateSecurityScore(config: Config): number {
        let score = 10;
        const security = config.tools.shellExecutor.security;

        // 根据各项配置扣分
        if (security.allowUnlistedCommands) score -= 3;
        if (security.allowDangerousCommands) score -= 2;
        if (security.allowlist.length === 0) score -= 2;
        if (security.blocklist.length === 0) score -= 1;
        if (!config.tools.smartDiff.requireConfirmation) score -= 1;

        // 检查是否有危险命令在白名单中
        const dangerousInAllowlist = security.allowlist.some(cmd =>
            this.dangerousCommands.some(dangerous =>
                cmd.toLowerCase().includes(dangerous.toLowerCase())
            )
        );
        if (dangerousInAllowlist) score -= 2;

        return Math.max(0, score);
    }

    /**
     * 获取安全建议
     * @param config 完整配置
     * @returns 安全建议数组
     */
    getSecurityRecommendations(config: Config): string[] {
        const recommendations: string[] = [];
        const security = config.tools.shellExecutor.security;

        if (security.allowUnlistedCommands) {
            recommendations.push('Consider setting allowUnlistedCommands to false and maintaining a specific allowlist');
        }

        if (security.allowDangerousCommands) {
            recommendations.push('Consider setting allowDangerousCommands to false for better security');
        }

        if (security.allowlist.length < 5) {
            recommendations.push('Consider adding more common safe commands to the allowlist');
        }

        if (!config.tools.smartDiff.requireConfirmation) {
            recommendations.push('Consider enabling requireConfirmation for diff operations');
        }

        if (config.tools.shellExecutor.defaultTimeout > 60000) {
            recommendations.push('Consider reducing shell timeout to prevent hanging processes');
        }

        return recommendations;
    }
}