import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { injectable } from 'inversify';
import { McpServerConfig } from '../tools/McpToolLoader.js';
import deepmergeFactory from '@fastify/deepmerge';
import { ConfigInitializer } from './ConfigInitializer.js';
import { ModelProvider, ModelConfig } from '../models/index.js';

/**
 * 部分更新类型，用于深度合并操作
 */
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
  /** AI模型配置数组 - 支持多个模型，SimpleAgent使用第一个 */
  models: ModelConfig[];
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
  models: [
    {
      provider: 'openai',
      name: 'gpt-4o-mini'
    }
  ],
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

    if (!this.config.models || !Array.isArray(this.config.models) || this.config.models.length === 0) {
      errors.push('At least one model configuration is required in the models array');
    } else {
      const firstModel = this.config.models[0];
      if (!firstModel.provider || !firstModel.name) {
        errors.push('First model must have provider and name specified');
      }
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
   * 获取当前模型的显示信息
   * @returns 模型显示字符串
   */
  public getModelDisplayName(): string {
    if (!this.config.models || this.config.models.length === 0) {
      return 'No models configured';
    }
    
    const firstModel = this.config.models[0];
    return `${firstModel.provider}:${firstModel.name}`;
  }
}