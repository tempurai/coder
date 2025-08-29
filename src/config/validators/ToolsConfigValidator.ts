import { Config } from '../ConfigLoader';
import { ValidationResult } from './ModelConfigValidator';

/**
 * 工具配置验证器
 * 负责验证各种工具配置参数的有效性和合理性
 */
export class ToolsConfigValidator {
    /**
     * 验证工具配置
     * @param config 完整配置对象
     * @returns 验证结果
     */
    validate(config: Config): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // 验证Shell执行器配置
        this.validateShellExecutorConfig(config, result);

        // 验证智能差异工具配置
        this.validateSmartDiffConfig(config, result);

        // 验证Web工具配置
        this.validateWebToolsConfig(config, result);

        // 验证MCP服务器配置
        this.validateMcpServersConfig(config, result);

        return result;
    }

    /**
     * 验证Shell执行器配置
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateShellExecutorConfig(config: Config, result: ValidationResult): void {
        const shellConfig = config.tools.shellExecutor;

        // 验证超时配置
        if (shellConfig.defaultTimeout <= 0) {
            result.errors.push('Shell executor timeout must be greater than 0');
            result.isValid = false;
        }

        if (shellConfig.defaultTimeout < 1000) {
            result.warnings.push('Very short shell timeout may cause command failures');
        }

        if (shellConfig.defaultTimeout > 600000) { // 10分钟
            result.warnings.push('Very long shell timeout may cause UI to hang');
        }

        // 验证重试配置
        if (shellConfig.maxRetries < 0) {
            result.errors.push('Shell executor maxRetries cannot be negative');
            result.isValid = false;
        }

        if (shellConfig.maxRetries > 20) {
            result.warnings.push('Very high retry count may cause excessive delays');
        }

        // 验证安全配置结构
        if (!shellConfig.security) {
            result.errors.push('Shell executor security configuration is required');
            result.isValid = false;
            return;
        }

        const security = shellConfig.security;

        // 验证白名单
        if (!Array.isArray(security.allowlist)) {
            result.errors.push('Shell executor allowlist must be an array');
            result.isValid = false;
        } else {
            // 验证白名单项的有效性
            const invalidCommands = security.allowlist.filter(cmd =>
                typeof cmd !== 'string' || cmd.trim().length === 0
            );
            if (invalidCommands.length > 0) {
                result.errors.push('Shell executor allowlist contains invalid commands');
                result.isValid = false;
            }

            // 检查白名单命令格式
            const suspiciousCommands = security.allowlist.filter(cmd =>
                cmd.includes('*') || cmd.includes('?') || cmd.includes('|') || cmd.includes(';')
            );
            if (suspiciousCommands.length > 0) {
                result.warnings.push(`Suspicious patterns in allowlist: ${suspiciousCommands.join(', ')}`);
            }
        }

        // 验证黑名单
        if (!Array.isArray(security.blocklist)) {
            result.errors.push('Shell executor blocklist must be an array');
            result.isValid = false;
        } else {
            const invalidBlocked = security.blocklist.filter(cmd =>
                typeof cmd !== 'string' || cmd.trim().length === 0
            );
            if (invalidBlocked.length > 0) {
                result.errors.push('Shell executor blocklist contains invalid commands');
                result.isValid = false;
            }
        }

        // 验证布尔配置
        if (typeof security.allowUnlistedCommands !== 'boolean') {
            result.errors.push('allowUnlistedCommands must be a boolean');
            result.isValid = false;
        }

        if (typeof security.allowDangerousCommands !== 'boolean') {
            result.errors.push('allowDangerousCommands must be a boolean');
            result.isValid = false;
        }
    }

    /**
     * 验证智能差异工具配置
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateSmartDiffConfig(config: Config, result: ValidationResult): void {
        const diffConfig = config.tools.smartDiff;

        // 验证上下文行数
        if (diffConfig.contextLines < 0) {
            result.errors.push('SmartDiff contextLines cannot be negative');
            result.isValid = false;
        }

        if (diffConfig.contextLines > 50) {
            result.warnings.push('Very high contextLines may produce large diffs');
        }

        if (diffConfig.contextLines === 0) {
            result.warnings.push('Zero contextLines may make diffs hard to understand');
        }

        // 验证重试次数
        if (diffConfig.maxRetries < 0) {
            result.errors.push('SmartDiff maxRetries cannot be negative');
            result.isValid = false;
        }

        if (diffConfig.maxRetries > 10) {
            result.warnings.push('Very high maxRetries may cause long delays on diff failures');
        }

        // 验证布尔配置
        if (typeof diffConfig.enableFuzzyMatching !== 'boolean') {
            result.errors.push('SmartDiff enableFuzzyMatching must be a boolean');
            result.isValid = false;
        }

        if (typeof diffConfig.requireConfirmation !== 'boolean') {
            result.errors.push('SmartDiff requireConfirmation must be a boolean');
            result.isValid = false;
        }

        // 安全性建议
        if (!diffConfig.requireConfirmation && diffConfig.enableFuzzyMatching) {
            result.warnings.push('Fuzzy matching without confirmation may apply unintended changes');
        }
    }

    /**
     * 验证Web工具配置
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateWebToolsConfig(config: Config, result: ValidationResult): void {
        const webConfig = config.tools.webTools;

        // 验证请求超时
        if (webConfig.requestTimeout <= 0) {
            result.errors.push('Web tools requestTimeout must be greater than 0');
            result.isValid = false;
        }

        if (webConfig.requestTimeout < 1000) {
            result.warnings.push('Very short requestTimeout may cause web request failures');
        }

        if (webConfig.requestTimeout > 120000) { // 2分钟
            result.warnings.push('Very long requestTimeout may cause UI to hang');
        }

        // 验证最大内容长度
        if (webConfig.maxContentLength <= 0) {
            result.errors.push('Web tools maxContentLength must be greater than 0');
            result.isValid = false;
        }

        if (webConfig.maxContentLength < 100) {
            result.warnings.push('Very small maxContentLength may truncate useful content');
        }

        if (webConfig.maxContentLength > 10000000) { // 10MB
            result.warnings.push('Very large maxContentLength may cause memory issues');
        }

        // 验证用户代理
        if (!webConfig.userAgent || typeof webConfig.userAgent !== 'string') {
            result.errors.push('Web tools userAgent must be a non-empty string');
            result.isValid = false;
        } else {
            if (webConfig.userAgent.trim().length === 0) {
                result.warnings.push('Empty userAgent may cause some sites to block requests');
            }

            if (webConfig.userAgent.length > 500) {
                result.warnings.push('Very long userAgent may be rejected by servers');
            }

            // 检查是否包含常见的机器人标识
            const botPatterns = ['bot', 'crawler', 'spider', 'scraper'];
            const isBot = botPatterns.some(pattern =>
                webConfig.userAgent.toLowerCase().includes(pattern)
            );
            if (isBot) {
                result.warnings.push('UserAgent identifies as bot - some sites may block requests');
            }
        }

        // 验证缓存配置
        if (typeof webConfig.enableCache !== 'boolean') {
            result.errors.push('Web tools enableCache must be a boolean');
            result.isValid = false;
        }
    }

    /**
     * 验证MCP服务器配置
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateMcpServersConfig(config: Config, result: ValidationResult): void {
        if (!config.mcpServers) {
            // MCP服务器配置是可选的
            return;
        }

        if (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
            result.errors.push('MCP servers configuration must be an object');
            result.isValid = false;
            return;
        }

        // 验证每个MCP服务器配置
        Object.entries(config.mcpServers).forEach(([name, serverConfig]) => {
            if (!name || name.trim().length === 0) {
                result.errors.push('MCP server name cannot be empty');
                result.isValid = false;
                return;
            }

            if (!serverConfig || typeof serverConfig !== 'object') {
                result.errors.push(`MCP server \"${name}\" configuration must be an object`);
                result.isValid = false;
                return;
            }

            // 验证服务器配置的必需字段
            if (!serverConfig.command && !serverConfig.args) {
                result.warnings.push(`MCP server \"${name}\" has no command or args specified`);
            }

            // 如果有命令，验证它是字符串或字符串数组
            if (serverConfig.command) {
                if (typeof serverConfig.command !== 'string') {
                    result.errors.push(`MCP server \"${name}\" command must be a string`);
                    result.isValid = false;
                }
            }

            // 如果有参数，验证它是字符串数组
            if (serverConfig.args) {
                if (!Array.isArray(serverConfig.args)) {
                    result.errors.push(`MCP server \"${name}\" args must be an array`);
                    result.isValid = false;
                } else {
                    const invalidArgs = serverConfig.args.filter(arg => typeof arg !== 'string');
                    if (invalidArgs.length > 0) {
                        result.errors.push(`MCP server \"${name}\" args must contain only strings`);
                        result.isValid = false;
                    }
                }
            }

            // 验证环境变量配置
            if (serverConfig.env && typeof serverConfig.env !== 'object') {
                result.errors.push(`MCP server \"${name}\" env must be an object`);
                result.isValid = false;
            }
        });

        const serverCount = Object.keys(config.mcpServers).length;
        if (serverCount > 10) {
            result.warnings.push(`Large number of MCP servers (${serverCount}) may impact startup time`);
        }
    }

    /**
     * 获取工具配置优化建议
     * @param config 完整配置
     * @returns 优化建议数组
     */
    getOptimizationRecommendations(config: Config): string[] {
        const recommendations: string[] = [];

        // Shell执行器优化建议
        const shellTimeout = config.tools.shellExecutor.defaultTimeout;
        if (shellTimeout > 60000) {
            recommendations.push('Consider reducing shell timeout for better responsiveness');
        }

        // 差异工具优化建议
        if (config.tools.smartDiff.contextLines > 10) {
            recommendations.push('Consider reducing contextLines for cleaner diffs');
        }

        if (!config.tools.smartDiff.enableFuzzyMatching) {
            recommendations.push('Consider enabling fuzzy matching for more flexible diff application');
        }

        // Web工具优化建议
        const webTimeout = config.tools.webTools.requestTimeout;
        if (webTimeout > 30000) {
            recommendations.push('Consider reducing web request timeout for better user experience');
        }

        if (!config.tools.webTools.enableCache) {
            recommendations.push('Consider enabling web cache for better performance');
        }

        // MCP服务器优化建议
        if (config.mcpServers && Object.keys(config.mcpServers).length === 0) {
            recommendations.push('Consider configuring MCP servers to extend functionality');
        }

        return recommendations;
    }

    /**
     * 验证工具配置的性能影响
     * @param config 完整配置
     * @returns 性能影响评估
     */
    assessPerformanceImpact(config: Config): {
        score: number; // 0-10, 10最佳性能
        issues: string[];
    } {
        let score = 10;
        const issues: string[] = [];

        // 评估Shell执行器性能影响
        if (config.tools.shellExecutor.defaultTimeout > 60000) {
            score -= 1;
            issues.push('Long shell timeout may cause UI freezing');
        }

        if (config.tools.shellExecutor.maxRetries > 5) {
            score -= 1;
            issues.push('High retry count may cause delays');
        }

        // 评估Web工具性能影响
        if (config.tools.webTools.requestTimeout > 30000) {
            score -= 1;
            issues.push('Long web timeout may cause UI delays');
        }

        if (config.tools.webTools.maxContentLength > 1000000) {
            score -= 2;
            issues.push('Large content limit may cause memory issues');
        }

        // 评估MCP服务器数量影响
        if (config.mcpServers && Object.keys(config.mcpServers).length > 5) {
            score -= 1;
            issues.push('Many MCP servers may slow startup');
        }

        return {
            score: Math.max(0, score),
            issues
        };
    }
}