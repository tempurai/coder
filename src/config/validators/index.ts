// 配置验证器模块的主要导出

export { ModelConfigValidator } from './ModelConfigValidator';
export { SecurityConfigValidator } from './SecurityConfigValidator';
export { ToolsConfigValidator } from './ToolsConfigValidator';
export type { ValidationResult } from './ModelConfigValidator';

// 综合验证器类
import { Config } from '../ConfigLoader';
import { ModelConfigValidator } from './ModelConfigValidator';
import { SecurityConfigValidator } from './SecurityConfigValidator';
import { ToolsConfigValidator } from './ToolsConfigValidator';
import type { ValidationResult } from './ModelConfigValidator';

/**
 * 综合配置验证器
 * 组合所有验证器进行完整的配置验证
 */
export class ConfigValidator {
    private modelValidator: ModelConfigValidator;
    private securityValidator: SecurityConfigValidator;
    private toolsValidator: ToolsConfigValidator;

    constructor() {
        this.modelValidator = new ModelConfigValidator();
        this.securityValidator = new SecurityConfigValidator();
        this.toolsValidator = new ToolsConfigValidator();
    }

    /**
     * 验证完整配置
     * @param config 配置对象
     * @returns 综合验证结果
     */
    validate(config: Config): ValidationResult {
        const results = [
            this.modelValidator.validate(config),
            this.securityValidator.validate(config),
            this.toolsValidator.validate(config)
        ];

        // 合并所有验证结果
        const combinedResult: ValidationResult = {
            isValid: results.every(r => r.isValid),
            errors: results.flatMap(r => r.errors),
            warnings: results.flatMap(r => r.warnings)
        };

        return combinedResult;
    }

    /**
     * 异步验证（包括模型连接测试）
     * @param config 配置对象
     * @returns Promise<ValidationResult>
     */
    async validateAsync(config: Config): Promise<ValidationResult> {
        // 先进行同步验证
        const syncResult = this.validate(config);

        // 如果同步验证失败，直接返回
        if (!syncResult.isValid) {
            return syncResult;
        }

        // 异步验证模型连接
        const connectionResult = await this.modelValidator.validateModelConnection(config);

        return {
            isValid: syncResult.isValid && connectionResult.isValid,
            errors: [...syncResult.errors, ...connectionResult.errors],
            warnings: [...syncResult.warnings, ...connectionResult.warnings]
        };
    }

    /**
     * 获取配置优化建议
     * @param config 配置对象
     * @returns 优化建议数组
     */
    getOptimizationRecommendations(config: Config): string[] {
        return [
            ...this.securityValidator.getSecurityRecommendations(config),
            ...this.toolsValidator.getOptimizationRecommendations(config)
        ];
    }

    /**
     * 评估配置的整体质量
     * @param config 配置对象
     * @returns 质量评分和分析
     */
    assessConfigQuality(config: Config): {
        overall: number; // 0-10
        security: number;
        performance: number;
        completeness: number;
        recommendations: string[];
    } {
        const validationResult = this.validate(config);
        const securityScore = this.calculateSecurityScore(config);
        const performanceAssessment = this.toolsValidator.assessPerformanceImpact(config);
        const completenessScore = this.calculateCompletenessScore(config);

        const overall = Math.round(
            (securityScore + performanceAssessment.score + completenessScore) / 3
        );

        return {
            overall,
            security: securityScore,
            performance: performanceAssessment.score,
            completeness: completenessScore,
            recommendations: [
                ...this.getOptimizationRecommendations(config),
                ...performanceAssessment.issues
            ]
        };
    }

    /**
     * 计算安全分数
     * @param config 配置对象
     * @returns 安全分数 0-10
     */
    private calculateSecurityScore(config: Config): number {
        const securityResult = this.securityValidator.validate(config);

        let score = 10;
        score -= securityResult.errors.length * 2;
        score -= securityResult.warnings.length * 0.5;

        return Math.max(0, Math.min(10, score));
    }

    /**
     * 计算配置完整性分数
     * @param config 配置对象
     * @returns 完整性分数 0-10
     */
    private calculateCompletenessScore(config: Config): number {
        let score = 0;

        // 基础配置 (40%)
        if (config.model) score += 2;
        if (config.apiKey || (typeof config.model !== 'string' && config.model.apiKey)) score += 2;

        // API密钥配置 (20%)
        if (config.tavilyApiKey) score += 1;

        // 工具配置完整性 (30%)
        if (config.tools?.shellExecutor) score += 1;
        if (config.tools?.webTools) score += 1;

        // MCP配置 (10%)
        if (config.mcpServers && Object.keys(config.mcpServers).length > 0) score += 1;

        return Math.min(10, score);
    }
}