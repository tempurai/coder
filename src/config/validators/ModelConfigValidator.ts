import { Config } from '../ConfigLoader.js';
import { ModelConfig, ModelProvider } from '../../models/index.js';
import type { LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';

/**
 * 验证结果接口
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * 模型配置验证器
 * 负责验证AI模型配置的有效性和API密钥
 */
export class ModelConfigValidator {
    private readonly supportedProviders: ModelProvider[] = [
        'openai', 'google', 'anthropic', 'xai', 'deepseek', 'azure', 'aws', 'openrouter', 'ollama', 'openai-compatible'
    ];

    /**
     * 验证模型配置
     * @param config 完整配置对象
     * @returns 验证结果
     */
    validate(config: Config): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // 验证模型配置数组是否存在
        if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
            result.errors.push('At least one model configuration is required in the models array');
            result.isValid = false;
            return result;
        }

        // 验证每个模型配置
        config.models.forEach((modelConfig, index) => {
            this.validateModelConfig(modelConfig, result, index);
        });

        // 验证API密钥
        this.validateApiKeys(config, result);

        // 验证生成参数
        this.validateGenerationParams(config, result);

        return result;
    }


    /**
     * 验证详细模型配置
     * @param modelConfig 模型配置对象
     * @param result 验证结果
     * @param index 模型在数组中的索引
     */
    private validateModelConfig(modelConfig: ModelConfig, result: ValidationResult, index?: number): void {
        const prefix = index !== undefined ? `Model ${index + 1}: ` : '';
        // 验证提供商
        if (!modelConfig.provider) {
            result.errors.push(`${prefix}Model provider is required`);
            result.isValid = false;
            return;
        }

        if (!this.supportedProviders.includes(modelConfig.provider)) {
            result.errors.push(`${prefix}Unsupported model provider: ${modelConfig.provider}`);
            result.isValid = false;
        }

        // 验证模型名称
        if (!modelConfig.name || !modelConfig.name.trim()) {
            result.errors.push(`${prefix}Model name is required`);
            result.isValid = false;
        }

        // 验证基础URL格式（仅对支持baseUrl的提供商）
        const hasBaseUrl = 'baseUrl' in modelConfig;
        if (hasBaseUrl && (modelConfig as any).baseUrl) {
            try {
                new URL((modelConfig as any).baseUrl);
            } catch {
                result.errors.push(`${prefix}Invalid baseUrl format`);
                result.isValid = false;
            }
        }

        // 验证提供商特定配置
        this.validateProviderSpecificConfig(modelConfig, result);
    }

    /**
     * 验证提供商特定配置
     * @param modelConfig 模型配置
     * @param result 验证结果
     */
    private validateProviderSpecificConfig(modelConfig: ModelConfig, result: ValidationResult): void {
        switch (modelConfig.provider) {
            case 'openai':
                this.validateOpenAIConfig(modelConfig, result);
                break;
            case 'google':
                this.validateGoogleConfig(modelConfig, result);
                break;
            case 'anthropic':
                this.validateAnthropicConfig(modelConfig, result);
                break;
            default:
                // 其他提供商的基础验证已经在上面完成
                break;
        }
    }

    /**
     * 验证OpenAI配置
     * @param modelConfig 模型配置
     * @param result 验证结果
     */
    private validateOpenAIConfig(modelConfig: ModelConfig, result: ValidationResult): void {
        const validModels = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'];

        if (!validModels.some(valid => modelConfig.name.startsWith(valid.split('-')[0]))) {
            result.warnings.push(`Unknown OpenAI model: ${modelConfig.name}`);
        }

        if (!modelConfig.apiKey && !process.env.OPENAI_API_KEY) {
            result.errors.push('OpenAI API key is required');
            result.isValid = false;
        }
    }

    /**
     * 验证Google配置
     * @param modelConfig 模型配置
     * @param result 验证结果
     */
    private validateGoogleConfig(modelConfig: ModelConfig, result: ValidationResult): void {
        const validModels = ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro', 'gemini-1.5-flash'];

        if (!validModels.some(valid => modelConfig.name.includes(valid.split('-')[0]))) {
            result.warnings.push(`Unknown Google model: ${modelConfig.name}`);
        }

        if (!modelConfig.apiKey && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            result.errors.push('Google Generative AI API key is required');
            result.isValid = false;
        }
    }

    /**
     * 验证Anthropic配置
     * @param modelConfig 模型配置
     * @param result 验证结果
     */
    private validateAnthropicConfig(modelConfig: ModelConfig, result: ValidationResult): void {
        const validModels = ['claude-3', 'claude-2', 'claude-instant'];

        if (!validModels.some(valid => modelConfig.name.includes(valid))) {
            result.warnings.push(`Unknown Anthropic model: ${modelConfig.name}`);
        }

        if (!modelConfig.apiKey && !process.env.ANTHROPIC_API_KEY) {
            result.errors.push('Anthropic API key is required');
            result.isValid = false;
        }
    }

    /**
     * 验证API密钥
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateApiKeys(config: Config, result: ValidationResult): void {
        // 检查向后兼容的apiKey字段
        if (config.apiKey && config.apiKey.length < 10) {
            result.warnings.push('API key seems too short, please verify');
        }

        // 检查Tavily API密钥格式
        if (config.tools.tavilyApiKey) {
            if (config.tools.tavilyApiKey.length < 10) {
                result.warnings.push('Tavily API key seems too short');
            }
        } else {
            result.warnings.push('Tavily API key not configured - web search will be disabled');
        }
    }

    /**
     * 验证生成参数
     * @param config 完整配置
     * @param result 验证结果
     */
    private validateGenerationParams(config: Config, result: ValidationResult): void {
        // 验证温度参数
        if (config.temperature < 0 || config.temperature > 2) {
            result.errors.push('Temperature must be between 0 and 2');
            result.isValid = false;
        }

        if (config.temperature > 1.5) {
            result.warnings.push('High temperature may produce inconsistent results');
        }

        // 验证maxTokens参数
        if (config.maxTokens <= 0) {
            result.errors.push('maxTokens must be greater than 0');
            result.isValid = false;
        }

        if (config.maxTokens > 128000) {
            result.warnings.push('Very high maxTokens may be expensive and slow');
        }

        if (config.maxTokens < 100) {
            result.warnings.push('Low maxTokens may truncate responses');
        }
    }

    /**
     * 尝试创建语言模型实例以验证配置
     * @param config 完整配置
     * @returns Promise<ValidationResult>
     */
    async validateModelConnection(config: Config): Promise<ValidationResult> {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        try {
            const model = await this.createLanguageModel(config);
            // 如果能成功创建模型实例，说明配置基本正确
            result.warnings.push('Model configuration appears valid');
        } catch (error) {
            result.errors.push(`Failed to create language model: ${error instanceof Error ? error.message : 'Unknown error'}`);
            result.isValid = false;
        }

        return result;
    }

    /**
     * 创建语言模型实例
     * @param config 配置对象
     * @returns Promise<LanguageModel>
     */
    private async createLanguageModel(config: Config): Promise<LanguageModel> {
        if (!config.models || config.models.length === 0) {
            throw new Error('No models configured. Please add at least one model to the models array.');
        }

        const modelConfig = config.models[0]; // 使用第一个模型

        // 获取API密钥
        const apiKey = modelConfig.apiKey || this.getEnvApiKey(modelConfig.provider);

        if (!apiKey) {
            throw new Error(`API key not found for provider: ${modelConfig.provider}`);
        }

        // 设置环境变量
        process.env.OPENAI_API_KEY = modelConfig.provider === 'openai' ? apiKey : process.env.OPENAI_API_KEY;
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = modelConfig.provider === 'google' ? apiKey : process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        process.env.ANTHROPIC_API_KEY = modelConfig.provider === 'anthropic' ? apiKey : process.env.ANTHROPIC_API_KEY;

        // 创建对应的语言模型
        switch (modelConfig.provider) {
            case 'openai':
                return openai(modelConfig.name);

            case 'google':
                return google(modelConfig.name);

            case 'anthropic':
                return anthropic(modelConfig.name);

            default:
                throw new Error(`Unsupported model provider: ${modelConfig.provider}`);
        }
    }

    /**
     * 获取环境变量中的API密钥
     * @param provider 提供商名称
     * @returns API密钥或undefined
     */
    private getEnvApiKey(provider: ModelProvider): string | undefined {
        switch (provider) {
            case 'openai':
                return process.env.OPENAI_API_KEY;
            case 'google':
                return process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            case 'anthropic':
                return process.env.ANTHROPIC_API_KEY;
            case 'xai':
                return process.env.XAI_API_KEY;
            case 'deepseek':
                return process.env.DEEPSEEK_API_KEY;
            case 'azure':
                return process.env.AZURE_OPENAI_API_KEY;
            case 'openrouter':
                return process.env.OPENROUTER_API_KEY;
            default:
                return undefined;
        }
    }
}