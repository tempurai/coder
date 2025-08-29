import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { McpServerConfig } from '../tools/McpToolLoader';
import type { LanguageModel } from 'ai';
import deepmergeFactory from '@fastify/deepmerge';

/**
 * 模型提供商类型
 * 支持的AI模型提供商
 */
export type ModelProvider = 'openai' | 'google' | 'anthropic' | 'cohere' | 'mistral';

/**
 * 模型配置接口
 * 支持灵活的模型指定方式，可以是字符串或详细配置对象
 */
export interface ModelConfig {
  /** 模型提供商 */
  provider: ModelProvider;
  /** 具体的模型名称 */
  name: string;
  /** 可选的API密钥（如果不在环境变量中） */
  apiKey?: string;
  /** 可选的基础URL（用于自定义端点） */
  baseUrl?: string;
  /** 其他提供商特定的配置选项 */
  options?: Record<string, any>;
}
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
  ? DeepPartial<T[P]>
  : T[P] extends (infer U)[]
  ? U[]
  : T[P];
};

/**
 * Shell执行器安全配置接口
 * 定义命令执行的安全策略和权限控制
 */
interface ShellExecutorSecurityConfig {
  /** 允许执行的命令白名单 (如: ['git', 'npm', 'node']) */
  allowlist: string[];
  /** 禁止执行的命令黑名单 (如: ['rm', 'sudo', 'chmod']) */
  blocklist: string[];
  /** 是否允许执行不在白名单中的命令 */
  allowUnlistedCommands: boolean;
  /** 是否允许危险命令 (需要显式确认的命令) */
  allowDangerousCommands: boolean;
}

/**
 * Shell执行器配置接口
 * 包含执行参数和安全策略的完整配置
 */
interface ShellExecutorConfig {
  /** 默认超时时间（毫秒） */
  defaultTimeout: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 安全配置 */
  security: ShellExecutorSecurityConfig;
}

/**
 * 智能差异工具配置接口
 * 控制代码差异分析和应用的行为
 */
interface SmartDiffConfig {
  /** 上下文行数 */
  contextLines: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 是否启用模糊匹配 */
  enableFuzzyMatching: boolean;
  /** 差异应用前是否需要确认 */
  requireConfirmation: boolean;
}

/**
 * Web工具配置接口
 * 控制网络请求和内容获取的安全策略
 */
interface WebToolsConfig {
  /** HTTP请求超时时间（毫秒） */
  requestTimeout: number;
  /** 最大内容长度（字符数） */
  maxContentLength: number;
  /** 用户代理字符串 */
  userAgent: string;
  /** 是否启用内容缓存 */
  enableCache: boolean;
}

/**
 * 工具配置接口
 * 聚合所有工具的配置选项
 */
interface ToolsConfig {
  /** Shell执行器配置 */
  shellExecutor: ShellExecutorConfig;
  /** 智能差异工具配置 */
  smartDiff: SmartDiffConfig;
  /** Web工具配置 */
  webTools: WebToolsConfig;
}

/**
 * 应用程序主配置接口
 */
export interface Config {
  /** AI模型配置 - 支持字符串（向后兼容）或详细配置对象 */
  model: string | ModelConfig;
  /** OpenAI API密钥（向后兼容，建议在ModelConfig中配置） */
  apiKey?: string;
  /** Tavily API密钥，用于网页搜索功能 */
  tavilyApiKey?: string;
  /** 生成温度 */
  temperature: number;
  /** 最大令牌数 */
  maxTokens: number;
  /** 工具配置 */
  tools: ToolsConfig;
  /** 用户自定义上下文（从.temurai.md读取） */
  customContext?: string;
  /** MCP 服务器配置 */
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * 默认配置对象
 * 提供所有配置选项的合理默认值
 */
const DEFAULT_CONFIG: Config = {
  model: 'gpt-4o-mini',
  temperature: 0.3,
  maxTokens: 4096,
  tavilyApiKey: undefined,
  mcpServers: {},
  tools: {
    shellExecutor: {
      defaultTimeout: 30000,
      maxRetries: 3,
      security: {
        allowlist: ['git', 'npm', 'node', 'pnpm', 'yarn', 'ls', 'cat', 'echo', 'mkdir', 'touch'],
        blocklist: ['rm', 'sudo', 'chmod', 'chown', 'dd', 'format', 'del', 'deltree'],
        allowUnlistedCommands: false,
        allowDangerousCommands: false
      }
    },
    smartDiff: {
      contextLines: 3,
      maxRetries: 3,
      enableFuzzyMatching: true,
      requireConfirmation: true
    },
    webTools: {
      requestTimeout: 15000,
      maxContentLength: 10000,
      userAgent: 'Tempurai-Bot/1.0 (Security-Enhanced)',
      enableCache: false
    }
  }
};

/**
 * 配置加载器类
 * 负责从用户配置文件中加载配置，支持默认值和用户自定义覆盖
 */
export class ConfigLoader {
  private config: Config;
  private readonly configDir: string;
  private readonly configFilePath: string;
  private readonly contextFilePath: string;
  private readonly deepMerge: (target: any, source: any) => any;

  /**
   * 构造函数
   */
  public constructor() {
    this.configDir = path.join(os.homedir(), '.temurai');
    this.configFilePath = path.join(this.configDir, 'config.json');
    this.contextFilePath = path.join(this.configDir, '.temurai.md');

    // 配置深度合并，数组完全替换（用户配置覆盖默认配置）
    this.deepMerge = deepmergeFactory({
      mergeArray: (opts) => (target: any[], source: any[]) => opts.clone(source)
    });

    this.config = this.loadConfiguration();
  }

  /**
   * 获取当前配置
   * @returns 当前配置对象
   */
  public getConfig(): Config {
    return { ...this.config }; // 返回配置的副本，防止外部修改
  }

  /**
   * 更新配置并保存到文件
   * @param updates 要更新的配置项（部分更新）
   * @returns Promise<void>
   */
  public async updateConfig(updates: Partial<Config>): Promise<void> {
    try {
      // 深度合并配置
      this.config = this.deepMerge(this.config, updates);

      // 确保配置目录存在
      await this.ensureConfigDirectory();

      // 保存到文件
      const configJson = JSON.stringify(this.config, null, 2);
      await fs.promises.writeFile(this.configFilePath, configJson, 'utf8');

      console.log(`✅ Configuration updated and saved to ${this.configFilePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update configuration: ${errorMessage}`);
    }
  }

  /**
   * 重新加载配置文件
   * @returns 重新加载后的配置
   */
  public reloadConfig(): Config {
    this.config = this.loadConfiguration();
    return this.getConfig();
  }

  /**
   * 获取配置文件路径
   * @returns 配置文件的完整路径
   */
  public getConfigPath(): string {
    return this.configFilePath;
  }

  /**
   * 获取自定义上下文文件路径
   * @returns 自定义上下文文件的完整路径
   */
  public getContextPath(): string {
    return this.contextFilePath;
  }

  /**
   * 检查配置是否有效
   * @returns 配置验证结果
   */
  public validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.model || typeof this.config.model !== 'string') {
      errors.push('Model name is required and must be a string');
    }

    if (this.config.temperature < 0 || this.config.temperature > 2) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (this.config.maxTokens < 1 || this.config.maxTokens > 128000) {
      errors.push('MaxTokens must be between 1 and 128000');
    }

    if (!this.config.apiKey && !process.env.OPENAI_API_KEY) {
      errors.push('API key must be provided either in config or OPENAI_API_KEY environment variable');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 加载用户自定义上下文
   * 从 ~/.temurai/.temurai.md 文件中读取用户自定义上下文内容
   * @returns 自定义上下文内容，如果文件不存在或读取失败则返回undefined
   */
  private loadCustomContext(): string | undefined {
    try {
      if (!fs.existsSync(this.contextFilePath)) {
        return undefined;
      }

      const contextContent = fs.readFileSync(this.contextFilePath, 'utf8');
      return contextContent.trim() || undefined;
    } catch (error) {
      console.warn(`⚠️ Failed to load custom context from .temurai.md: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return undefined;
    }
  }

  /**
   * 从文件加载配置
   * @returns 加载的配置对象
   */
  private loadConfiguration(): Config {
    try {
      // 如果配置文件不存在，创建默认配置
      if (!fs.existsSync(this.configFilePath)) {
        this.createDefaultConfig();
        return { ...DEFAULT_CONFIG, customContext: this.loadCustomContext() };
      }

      // 读取配置文件
      const configContent = fs.readFileSync(this.configFilePath, 'utf8');
      const userConfig: Partial<Config> = JSON.parse(configContent);

      // 合并用户配置和默认配置
      const mergedConfig = this.deepMerge(DEFAULT_CONFIG, userConfig);

      // 加载用户自定义上下文
      mergedConfig.customContext = this.loadCustomContext();

      return mergedConfig;
    } catch (error) {
      console.warn(`⚠️ Failed to load config file, using defaults: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const defaultConfig = { ...DEFAULT_CONFIG };
      defaultConfig.customContext = this.loadCustomContext();
      return defaultConfig;
    }
  }

  /**
   * 创建默认配置文件
   */
  private createDefaultConfig(): void {
    try {
      // 确保配置目录存在
      fs.mkdirSync(this.configDir, { recursive: true });

      // 写入默认配置
      const defaultConfigJson = JSON.stringify(DEFAULT_CONFIG, null, 2);
      fs.writeFileSync(this.configFilePath, defaultConfigJson, 'utf8');

      console.log(`📁 Created default configuration at ${this.configFilePath}`);
      console.log('💡 Please edit this file to add your OpenAI API key and customize settings.');
      console.log(`💡 You can also create ${this.contextFilePath} for custom context.`);
    } catch (error) {
      console.error(`❌ Failed to create default config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 确保配置目录存在
   * @returns Promise<void>
   */
  private async ensureConfigDirectory(): Promise<void> {
    try {
      await fs.promises.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create config directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 创建语言模型实例
   * 根据配置动态创建并返回适合的 LanguageModel 实例
   * @returns Promise<LanguageModel> 配置的语言模型实例
   */
  public async createLanguageModel(): Promise<LanguageModel> {
    const modelConfig = this.normalizeModelConfig(this.config.model);
    
    try {
      switch (modelConfig.provider) {
        case 'openai':
          return await this.createOpenAIModel(modelConfig);
        case 'google':
          return await this.createGoogleModel(modelConfig);
        case 'anthropic':
          return await this.createAnthropicModel(modelConfig);
        case 'cohere':
          return await this.createCohereModel(modelConfig);
        case 'mistral':
          return await this.createMistralModel(modelConfig);
        default:
          throw new Error(`Unsupported model provider: ${modelConfig.provider}`);
      }
    } catch (error) {
      throw new Error(`Failed to create language model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 规范化模型配置
   * 将字符串或配置对象转换为标准的 ModelConfig
   * @param model 模型配置（字符串或对象）
   * @returns 规范化的模型配置
   */
  private normalizeModelConfig(model: string | ModelConfig): ModelConfig {
    if (typeof model === 'string') {
      // 向后兼容：将字符串转换为 ModelConfig
      return this.parseModelString(model);
    }
    
    return model;
  }

  /**
   * 解析模型字符串为 ModelConfig
   * 支持格式：'gpt-4o-mini' 或 'openai:gpt-4o-mini'
   * @param modelString 模型字符串
   * @returns 解析后的 ModelConfig
   */
  private parseModelString(modelString: string): ModelConfig {
    if (modelString.includes(':')) {
      const [provider, name] = modelString.split(':', 2);
      return {
        provider: provider as ModelProvider,
        name: name,
        apiKey: this.config.apiKey
      };
    }
    
    // 根据模型名称推断提供商
    const provider = this.inferProviderFromModelName(modelString);
    return {
      provider,
      name: modelString,
      apiKey: this.config.apiKey
    };
  }

  /**
   * 根据模型名称推断提供商
   * @param modelName 模型名称
   * @returns 推断的提供商
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
    if (modelName.includes('cohere') || modelName.startsWith('command-')) {
      return 'cohere';
    }
    if (modelName.includes('mistral') || modelName.startsWith('mixtral-')) {
      return 'mistral';
    }
    
    // 默认为 OpenAI（向后兼容）
    return 'openai';
  }

  /**
   * 创建 OpenAI 模型实例
   */
  private async createOpenAIModel(config: ModelConfig): Promise<LanguageModel> {
    const { openai } = await import('@ai-sdk/openai');
    
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please set it in config or OPENAI_API_KEY environment variable.');
    }
    
    // 设置环境变量
    process.env.OPENAI_API_KEY = apiKey;
    
    // 直接使用 openai(modelName) 的标准格式
    return openai(config.name) as LanguageModel;
  }

  /**
   * 创建 Google 模型实例
   */
  private async createGoogleModel(config: ModelConfig): Promise<LanguageModel> {
    const { google } = await import('@ai-sdk/google');
    
    const apiKey = config.apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Google AI API key not found. Please set it in config or GOOGLE_AI_API_KEY environment variable.');
    }
    
    // 设置环境变量
    process.env.GOOGLE_AI_API_KEY = apiKey;
    
    return google(config.name) as LanguageModel;
  }

  /**
   * 创建 Anthropic 模型实例
   */
  private async createAnthropicModel(config: ModelConfig): Promise<LanguageModel> {
    const { anthropic } = await import('@ai-sdk/anthropic');
    
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key not found. Please set it in config or ANTHROPIC_API_KEY environment variable.');
    }
    
    // 设置环境变量
    process.env.ANTHROPIC_API_KEY = apiKey;
    
    return anthropic(config.name) as LanguageModel;
  }

  /**
   * 创建 Cohere 模型实例
   */
  private async createCohereModel(config: ModelConfig): Promise<LanguageModel> {
    const { cohere } = await import('@ai-sdk/cohere');
    
    const apiKey = config.apiKey || process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error('Cohere API key not found. Please set it in config or COHERE_API_KEY environment variable.');
    }
    
    // 设置环境变量
    process.env.COHERE_API_KEY = apiKey;
    
    return cohere(config.name) as LanguageModel;
  }

  /**
   * 创建 Mistral 模型实例
   */
  private async createMistralModel(config: ModelConfig): Promise<LanguageModel> {
    const { mistral } = await import('@ai-sdk/mistral');
    
    const apiKey = config.apiKey || process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('Mistral API key not found. Please set it in config or MISTRAL_API_KEY environment variable.');
    }
    
    // 设置环境变量
    process.env.MISTRAL_API_KEY = apiKey;
    
    return mistral(config.name) as LanguageModel;
  }

  /**
   * 获取当前模型的显示信息
   * @returns 模型显示字符串
   */
  public getModelDisplayName(): string {
    const modelConfig = this.normalizeModelConfig(this.config.model);
    return `${modelConfig.provider}:${modelConfig.name}`;
  }
}