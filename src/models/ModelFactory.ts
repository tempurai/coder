import { injectable, inject, optional } from 'inversify';
import type { LanguageModel } from 'ai';
import type { Logger } from '../utils/Logger.js';
import { TYPES } from '../di/types.js';

/**
 * 支持的模型提供商
 * 基于 AI SDK 官方支持 + 主流提供商
 */
export type ModelProvider =
  | 'openai'           // OpenAI GPT models
  | 'google'           // Google Gemini models  
  | 'anthropic'        // Anthropic Claude models
  | 'xai'              // xAI Grok models
  | 'deepseek'         // DeepSeek models
  | 'azure'            // Azure OpenAI
  | 'aws'              // AWS Bedrock
  | 'openrouter'       // OpenRouter proxy
  | 'ollama'           // Ollama local models
  | 'openai-compatible'; // Custom OpenAI-compatible endpoints

/**
 * 基础模型配置接口
 */
interface BaseModelConfig {
  /** 模型提供商 */
  provider: ModelProvider;
  /** 具体的模型名称 */
  name: string;
  /** 可选的API密钥（如果不在环境变量中） */
  apiKey?: string;
}

/**
 * OpenAI 模型配置
 */
interface OpenAIModelConfig extends BaseModelConfig {
  provider: 'openai';
  /** 可选的基础URL（用于自定义端点） */
  baseUrl?: string;
  /** 其他OpenAI特定配置 */
  options?: {
    organization?: string;
    project?: string;
  };
}

/**
 * Google 模型配置
 */
interface GoogleModelConfig extends BaseModelConfig {
  provider: 'google';
  options?: {
    safetySettings: unknown[];
    generationConfig?: unknown;
  };
}

/**
 * Anthropic 模型配置
 */
interface AnthropicModelConfig extends BaseModelConfig {
  provider: 'anthropic';
  options?: {
    version?: string;
  };
}

/**
 * xAI Grok 模型配置
 */
interface XAIModelConfig extends BaseModelConfig {
  provider: 'xai';
}

/**
 * DeepSeek 模型配置
 */
interface DeepSeekModelConfig extends BaseModelConfig {
  provider: 'deepseek';
}

/**
 * Azure OpenAI 模型配置
 */
interface AzureModelConfig extends BaseModelConfig {
  provider: 'azure';
  /** Azure 资源名称 */
  resourceName: string;
  /** 部署名称 */
  deploymentName?: string;
  /** API 版本 */
  apiVersion?: string;
}

/**
 * AWS Bedrock 模型配置
 */
interface AWSModelConfig extends BaseModelConfig {
  provider: 'aws';
  /** AWS 区域 */
  region?: string;
  options?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
}

/**
 * OpenRouter 模型配置
 */
interface OpenRouterModelConfig extends BaseModelConfig {
  provider: 'openrouter';
  /** 可选的站点URL和名称用于统计 */
  options?: {
    siteName?: string;
    siteUrl?: string;
  };
}

/**
 * Ollama 本地模型配置
 */
interface OllamaModelConfig extends BaseModelConfig {
  provider: 'ollama';
  /** Ollama 服务器地址，默认 http://localhost:11434 */
  baseUrl?: string;
}

/**
 * OpenAI 兼容模型配置
 */
interface OpenAICompatibleModelConfig extends BaseModelConfig {
  provider: 'openai-compatible';
  /** 必需的基础URL */
  baseUrl: string;
  /** 自定义模型的显示名称 */
  displayName?: string;
}

/**
 * 联合模型配置类型
 */
export type ModelConfig =
  | OpenAIModelConfig
  | GoogleModelConfig
  | AnthropicModelConfig
  | XAIModelConfig
  | DeepSeekModelConfig
  | AzureModelConfig
  | AWSModelConfig
  | OpenRouterModelConfig
  | OllamaModelConfig
  | OpenAICompatibleModelConfig;

/**
 * 模型工厂接口
 */
interface ModelFactory {
  /** 创建模型实例 */
  createModel(config: ModelConfig | string): Promise<LanguageModel>;

  /** 获取支持的提供商列表 */
  getSupportedProviders(): ModelProvider[];

  /** 解析模型字符串为配置对象 */
  parseModelString(modelString: string): ModelConfig;
}

/**
 * 主流模型工厂实现
 * 支持多种AI模型提供商和自定义端点
 */
@injectable()
export class DefaultModelFactory implements ModelFactory {

  constructor(
    @inject(TYPES.Logger) @optional() private logger?: Logger
  ) { }

  /**
   * 创建带日志功能的模型包装器
   */
  /**
   * 创建带日志功能的fetch包装器
   */
  private createLoggingFetch(provider: string, modelName: string) {
    if (!this.logger) {
      return fetch;
    }

    return async (url: RequestInfo | URL, options?: RequestInit) => {
      const requestId = Date.now().toString();
      const startTime = Date.now();

      try {
        // 记录请求
        this.logger!.info('Model API request started', {
          requestId,
          provider,
          model: modelName,
          url: url.toString(),
          method: options?.method || 'GET',
          headers: options?.headers,
          body: options?.body
        }, 'MODEL');

        // 执行请求
        const response = await fetch(url, options);

        // 记录响应
        const duration = Date.now() - startTime;
        this.logger!.info('Model API request completed', {
          requestId,
          provider,
          model: modelName,
          status: response.status,
          statusText: response.statusText,
          duration,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          responseBody: await response.json()
        }, 'MODEL');

        return response;
      } catch (error) {
        // 记录错误
        const duration = Date.now() - startTime;
        this.logger!.error('Model API request failed', {
          requestId,
          provider,
          model: modelName,
          duration,
          error: error instanceof Error ? error.message : String(error)
        }, 'MODEL');
        throw error;
      }
    };
  }

  private wrapModelWithLogging(model: LanguageModel, provider: string, modelName: string): LanguageModel {
    this.logger?.info('Model instance created', { provider, model: modelName }, 'MODEL');
    return model;
  }

  /**
   * 创建模型实例
   * @param config - 模型配置对象或模型字符串
   * @returns Promise<LanguageModel> - AI SDK 语言模型实例
   */
  async createModel(config: ModelConfig | string): Promise<LanguageModel> {
    const modelConfig = typeof config === 'string'
      ? this.parseModelString(config)
      : config;

    this.logger?.info('Creating model instance', { provider: modelConfig.provider, name: modelConfig.name }, 'MODEL');

    let model: LanguageModel;
    switch (modelConfig.provider) {
      case 'openai':
        model = await this.createOpenAIModel(modelConfig as OpenAIModelConfig);
        break;
      case 'google':
        model = await this.createGoogleModel(modelConfig as GoogleModelConfig);
        break;
      case 'anthropic':
        model = await this.createAnthropicModel(modelConfig as AnthropicModelConfig);
        break;
      case 'xai':
        model = await this.createXAIModel(modelConfig as XAIModelConfig);
        break;
      case 'deepseek':
        model = await this.createDeepSeekModel(modelConfig as DeepSeekModelConfig);
        break;
      case 'azure':
        model = await this.createAzureModel(modelConfig as AzureModelConfig);
        break;
      case 'aws':
        model = await this.createAWSModel(modelConfig as AWSModelConfig);
        break;
      case 'openrouter':
        model = await this.createOpenRouterModel(modelConfig as OpenRouterModelConfig);
        break;
      case 'ollama':
        model = await this.createOllamaModel(modelConfig as OllamaModelConfig);
        break;
      case 'openai-compatible':
        model = await this.createOpenAICompatibleModel(modelConfig as OpenAICompatibleModelConfig);
        break;
      default:
        throw new Error(`Unsupported model provider: ${(modelConfig as { provider: string }).provider}`);
    }

    return this.wrapModelWithLogging(model, modelConfig.provider, modelConfig.name);
  }

  /**
   * 获取支持的提供商列表
   * @returns ModelProvider[] - 支持的模型提供商数组
   */
  getSupportedProviders(): ModelProvider[] {
    return [
      'openai',
      'google',
      'anthropic',
      'xai',
      'deepseek',
      'azure',
      'aws',
      'openrouter',
      'ollama',
      'openai-compatible'
    ];
  }

  /**
   * 解析模型字符串为配置对象
   * 支持格式：'gpt-4o-mini' 或 'openai:gpt-4o-mini' 或 'openai-compatible:http://localhost:8080:my-model'
   * @param modelString - 模型字符串
   * @returns ModelConfig - 解析后的模型配置对象
   */
  parseModelString(modelString: string): ModelConfig {
    if (modelString.includes(':')) {
      const parts = modelString.split(':');

      if (parts.length === 2) {
        const [provider, name] = parts;
        return {
          provider: provider as ModelProvider,
          name: name
        } as ModelConfig;
      } else if (parts.length === 3 && parts[0] === 'openai-compatible') {
        // openai-compatible:http://localhost:8080:model-name
        const [, baseUrl, name] = parts;
        return {
          provider: 'openai-compatible',
          name: name,
          baseUrl: baseUrl
        } as OpenAICompatibleModelConfig;
      }
    }

    // 根据模型名称推断提供商
    const provider = this.inferProviderFromModelName(modelString);
    return {
      provider,
      name: modelString
    } as ModelConfig;
  }

  /**
   * 根据模型名称推断提供商
   * @param modelName - 模型名称
   * @returns ModelProvider - 推断的提供商
   */
  private inferProviderFromModelName(modelName: string): ModelProvider {
    if (modelName.startsWith('gpt-') || modelName.includes('openai')) {
      return 'openai';
    }
    if (modelName.startsWith('gemini-') || modelName.includes('google')) {
      return 'google';
    }
    if (modelName.startsWith('claude-') || modelName.includes('anthropic')) {
      return 'anthropic';
    }
    if (modelName.startsWith('grok-') || modelName.includes('xai')) {
      return 'xai';
    }
    if (modelName.includes('deepseek')) {
      return 'deepseek';
    }

    // 默认为 OpenAI（向后兼容）
    return 'openai';
  }

  /**
   * 创建 OpenAI 模型实例
   * @param config - OpenAI 模型配置
   * @returns Promise<LanguageModel> - OpenAI 语言模型实例
   */
  private async createOpenAIModel(config: OpenAIModelConfig): Promise<LanguageModel> {
    const { openai } = await import('@ai-sdk/openai');

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please set it in config or OPENAI_API_KEY environment variable.');
    }

    // 设置环境变量
    process.env.OPENAI_API_KEY = apiKey;

    // 如果配置了自定义baseUrl，设置为环境变量
    if (config.baseUrl) {
      process.env.OPENAI_BASE_URL = config.baseUrl;
    }

    // 创建带日志的OpenAI实例
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openaiWithLogging = createOpenAI({
      apiKey,
      baseURL: config.baseUrl,
      fetch: this.createLoggingFetch('openai', config.name)
    });

    return openaiWithLogging(config.name) as LanguageModel;
  }

  /**
   * 创建 Google 模型实例
   * @param config - Google 模型配置
   * @returns Promise<LanguageModel> - Google 语言模型实例
   */
  private async createGoogleModel(config: GoogleModelConfig): Promise<LanguageModel> {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');

    const apiKey = config.apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Google AI API key not found. Please set it in config or GOOGLE_AI_API_KEY environment variable.');
    }

    const googleWithLogging = createGoogleGenerativeAI({
      apiKey,
      fetch: this.createLoggingFetch('google', config.name)
    });

    return googleWithLogging(config.name) as LanguageModel;
  }

  /**
   * 创建 Anthropic 模型实例
   * @param config - Anthropic 模型配置
   * @returns Promise<LanguageModel> - Anthropic 语言模型实例
   */
  private async createAnthropicModel(config: AnthropicModelConfig): Promise<LanguageModel> {
    const { createAnthropic } = await import('@ai-sdk/anthropic');

    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key not found. Please set it in config or ANTHROPIC_API_KEY environment variable.');
    }

    const anthropicWithLogging = createAnthropic({
      apiKey,
      fetch: this.createLoggingFetch('anthropic', config.name)
    });

    return anthropicWithLogging(config.name) as LanguageModel;
  }

  /**
   * 创建 xAI 模型实例 (通过 OpenAI 兼容接口)
   * @param config - xAI 模型配置
   * @returns Promise<LanguageModel> - xAI 语言模型实例
   */
  private async createXAIModel(config: XAIModelConfig): Promise<LanguageModel> {
    const { createOpenAI } = await import('@ai-sdk/openai');

    const apiKey = config.apiKey || process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error('xAI API key not found. Please set it in config or XAI_API_KEY environment variable.');
    }

    const xaiProvider = createOpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.x.ai/v1',
      fetch: this.createLoggingFetch('xai', config.name)
    });

    return xaiProvider(config.name) as LanguageModel;
  }

  /**
   * 创建 DeepSeek 模型实例
   * @param config - DeepSeek 模型配置
   * @returns Promise<LanguageModel> - DeepSeek 语言模型实例
   */
  private async createDeepSeekModel(config: DeepSeekModelConfig): Promise<LanguageModel> {
    const { createOpenAI } = await import('@ai-sdk/openai');

    const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DeepSeek API key not found. Please set it in config or DEEPSEEK_API_KEY environment variable.');
    }

    const deepseekProvider = createOpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.deepseek.com/v1',
      fetch: this.createLoggingFetch('deepseek', config.name)
    });

    return deepseekProvider(config.name) as LanguageModel;
  }

  /**
   * 创建 Azure OpenAI 模型实例
   * @param config - Azure 模型配置
   * @returns Promise<LanguageModel> - Azure OpenAI 语言模型实例
   */
  private async createAzureModel(config: AzureModelConfig): Promise<LanguageModel> {
    const { createOpenAI } = await import('@ai-sdk/openai');

    const apiKey = config.apiKey || process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Azure OpenAI API key not found. Please set it in config or AZURE_OPENAI_API_KEY environment variable.');
    }

    const azureProvider = createOpenAI({
      apiKey: apiKey,
      baseURL: `https://${config.resourceName}.openai.azure.com/openai/deployments/${config.deploymentName || config.name}`,
      headers: {
        'api-key': apiKey,
      },
      fetch: this.createLoggingFetch('azure', config.name)
    });

    return azureProvider(config.name) as LanguageModel;
  }

  /**
   * 创建 AWS Bedrock 模型实例 (暂不支持)
   * @param config - AWS 模型配置
   * @returns Promise<LanguageModel> - AWS Bedrock 语言模型实例
   */
  private async createAWSModel(config: AWSModelConfig): Promise<LanguageModel> {
    throw new Error('AWS Bedrock provider is not yet supported. Please use another provider.');
  }

  /**
   * 创建 OpenRouter 模型实例
   * @param config - OpenRouter 模型配置
   * @returns Promise<LanguageModel> - OpenRouter 语言模型实例
   */
  private async createOpenRouterModel(config: OpenRouterModelConfig): Promise<LanguageModel> {
    const { createOpenAI } = await import('@ai-sdk/openai');

    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key not found. Please set it in config or OPENROUTER_API_KEY environment variable.');
    }

    const openRouterProvider = createOpenAI({
      apiKey: apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': config.options?.siteUrl || 'https://tempurai.ai',
        'X-Title': config.options?.siteName || 'Tempurai',
      },
      fetch: this.createLoggingFetch('openrouter', config.name)
    });

    return openRouterProvider(config.name) as LanguageModel;
  }

  /**
   * 创建 Ollama 模型实例 (暂不支持)
   * @param config - Ollama 模型配置
   * @returns Promise<LanguageModel> - Ollama 语言模型实例
   */
  private async createOllamaModel(config: OllamaModelConfig): Promise<LanguageModel> {
    throw new Error('Ollama provider is not yet supported. Please use another provider.');
  }

  /**
   * 创建 OpenAI 兼容模型实例
   * @param config - OpenAI 兼容模型配置
   * @returns Promise<LanguageModel> - OpenAI 兼容语言模型实例
   */
  private async createOpenAICompatibleModel(config: OpenAICompatibleModelConfig): Promise<LanguageModel> {
    const { createOpenAI } = await import('@ai-sdk/openai');

    if (!config.baseUrl) {
      throw new Error('OpenAI-compatible model requires baseUrl');
    }

    const apiKey = config.apiKey || 'dummy-key'; // 某些本地模型不需要真实的API key

    const compatibleProvider = createOpenAI({
      apiKey: apiKey,
      baseURL: config.baseUrl,
      fetch: this.createLoggingFetch('openai-compatible', config.name)
    });

    return compatibleProvider(config.name) as LanguageModel;
  }
}