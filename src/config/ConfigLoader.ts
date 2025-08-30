import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { injectable } from 'inversify';
import { McpServerConfig } from '../tools/McpToolLoader.js';
import type { LanguageModel } from 'ai';
import deepmergeFactory from '@fastify/deepmerge';
import { ConfigInitializer } from './ConfigInitializer.js';

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
  /** 用户自定义上下文（从.tempurai.md读取） */
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
@injectable()
export class ConfigLoader {
  private config: Config;
  private readonly globalConfigDir: string;
  private readonly globalConfigFilePath: string;
  private readonly globalContextFilePath: string;
  private readonly projectConfigDir: string;
  private readonly projectConfigFilePath: string;
  private readonly projectContextFilePath: string;
  private readonly deepMerge: (target: any, source: any) => any;

  /**
   * 构造函数
   */
  public constructor() {
    // 全局配置路径（用户主目录）
    this.globalConfigDir = path.join(os.homedir(), '.tempurai');
    this.globalConfigFilePath = path.join(this.globalConfigDir, 'config.json');
    this.globalContextFilePath = path.join(this.globalConfigDir, '.tempurai.md');

    // 项目本地配置路径（当前工作目录）
    this.projectConfigDir = path.join(process.cwd(), '.tempurai');
    this.projectConfigFilePath = path.join(this.projectConfigDir, 'config.json');
    this.projectContextFilePath = path.join(this.projectConfigDir, 'directives.md');

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
   * @param saveToProject 是否保存到项目配置（默认保存到全局配置）
   * @returns Promise<void>
   */
  public async updateConfig(updates: Partial<Config>, saveToProject: boolean = false): Promise<void> {
    try {
      // 深度合并配置
      this.config = this.deepMerge(this.config, updates);

      const targetConfigDir = saveToProject ? this.projectConfigDir : this.globalConfigDir;
      const targetConfigPath = saveToProject ? this.projectConfigFilePath : this.globalConfigFilePath;

      // 确保配置目录存在
      await this.ensureConfigDirectory(targetConfigDir);

      // 保存到文件
      const configJson = JSON.stringify(this.config, null, 2);
      await fs.promises.writeFile(targetConfigPath, configJson, 'utf8');

      const location = saveToProject ? 'project' : 'global';
      console.log(`✅ Configuration updated and saved to ${location} config: ${targetConfigPath}`);
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
   * @param project 是否返回项目配置路径（默认返回全局配置路径）
   * @returns 配置文件的完整路径
   */
  public getConfigPath(project: boolean = false): string {
    return project ? this.projectConfigFilePath : this.globalConfigFilePath;
  }

  /**
   * 获取自定义上下文文件路径
   * @param project 是否返回项目上下文路径（默认返回全局上下文路径）
   * @returns 自定义上下文文件的完整路径
   */
  public getContextPath(project: boolean = false): string {
    return project ? this.projectContextFilePath : this.globalContextFilePath;
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
   * 优先从项目本地的 ./.tempurai/directives.md 文件中读取
   * 如果不存在，则从全局的 ~/.tempurai/.tempurai.md 文件中读取
   * @returns 自定义上下文内容，如果文件不存在或读取失败则返回undefined
   */
  private loadCustomContext(): string | undefined {
    // 优先尝试读取项目本地的 directives.md
    try {
      if (fs.existsSync(this.projectContextFilePath)) {
        const contextContent = fs.readFileSync(this.projectContextFilePath, 'utf8');
        const content = contextContent.trim();
        if (content) {
          console.log(`📄 Loaded project directives from ${this.projectContextFilePath}`);
          return content;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load project directives: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Fallback到全局的 .tempurai.md
    try {
      if (fs.existsSync(this.globalContextFilePath)) {
        const contextContent = fs.readFileSync(this.globalContextFilePath, 'utf8');
        const content = contextContent.trim();
        if (content) {
          console.log(`📄 Loaded global context from ${this.globalContextFilePath}`);
          return content;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load global context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return undefined;
  }

  /**
   * 从文件加载配置
   * 实现"全局默认 + 项目覆盖"策略：
   * 1. 从默认配置开始
   * 2. 加载并合并全局配置（~/.tempurai/config.json）
   * 3. 加载并合并项目配置（./.tempurai/config.json）
   * 4. 加载自定义上下文（优先项目本地，fallback到全局）
   * @returns 加载的配置对象
   */
  private loadConfiguration(): Config {
    let mergedConfig: Config = { ...DEFAULT_CONFIG };

    try {
      // 第一步：尝试加载全局配置
      if (fs.existsSync(this.globalConfigFilePath)) {
        try {
          const globalConfigContent = fs.readFileSync(this.globalConfigFilePath, 'utf8');
          const globalConfig: Partial<Config> = JSON.parse(globalConfigContent);
          mergedConfig = this.deepMerge(mergedConfig, globalConfig);
          console.log(`🔧 Loaded global config from ${this.globalConfigFilePath}`);
        } catch (error) {
          console.warn(`⚠️ Failed to load global config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // 如果全局配置不存在，使用ConfigInitializer创建默认配置（同步版本）
        const initializer = new ConfigInitializer();
        if (!initializer.configExists()) {
          // 仅创建配置文件，不执行完整的异步初始化
          initializer.createConfigSync();
        }
        
        // 重新尝试加载配置
        if (fs.existsSync(this.globalConfigFilePath)) {
          try {
            const globalConfigContent = fs.readFileSync(this.globalConfigFilePath, 'utf8');
            const globalConfig: Partial<Config> = JSON.parse(globalConfigContent);
            mergedConfig = this.deepMerge(mergedConfig, globalConfig);
            console.log(`🔧 Loaded global config from ${this.globalConfigFilePath}`);
          } catch (error) {
            console.warn(`⚠️ Failed to load newly created global config: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      // 第二步：尝试加载项目本地配置（覆盖全局配置）
      if (fs.existsSync(this.projectConfigFilePath)) {
        try {
          const projectConfigContent = fs.readFileSync(this.projectConfigFilePath, 'utf8');
          const projectConfig: Partial<Config> = JSON.parse(projectConfigContent);
          mergedConfig = this.deepMerge(mergedConfig, projectConfig);
          console.log(`🔧 Loaded and merged project config from ${this.projectConfigFilePath}`);
        } catch (error) {
          console.warn(`⚠️ Failed to load project config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // 第三步：加载自定义上下文（优先项目本地）
      mergedConfig.customContext = this.loadCustomContext();

    } catch (error) {
      console.warn(`⚠️ Configuration loading failed, using defaults: ${error instanceof Error ? error.message : 'Unknown error'}`);
      mergedConfig = { ...DEFAULT_CONFIG };
      mergedConfig.customContext = this.loadCustomContext();
    }

    return mergedConfig;
  }

  /**
   * 静态方法：在应用启动时初始化配置
   * 使用ConfigInitializer来处理初始化
   * @returns Promise<void>
   */
  public static async initializeConfigOnStartup(): Promise<void> {
    await ConfigInitializer.quickInitialize();
  }

  /**
   * 确保配置目录存在
   * @param configDir 配置目录路径，如果未提供则使用全局配置目录
   * @returns Promise<void>
   */
  private async ensureConfigDirectory(configDir: string = this.globalConfigDir): Promise<void> {
    try {
      await fs.promises.mkdir(configDir, { recursive: true });
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

    // 如果配置了自定义baseUrl，设置为环境变量
    if (config.baseUrl) {
      process.env.OPENAI_BASE_URL = config.baseUrl;
    }

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