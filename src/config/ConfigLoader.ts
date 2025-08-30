import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { injectable } from 'inversify';
import { McpServerConfig } from '../tools/McpToolLoader.js';
import deepmergeFactory from '@fastify/deepmerge';
import { ConfigInitializer } from './ConfigInitializer.js';
import { ModelProvider, ModelConfig } from '../models/index.js';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
  ? DeepPartial<T[P]>
  : T[P] extends (infer U)[]
  ? U[]
  : T[P];
};

interface ShellExecutorSecurityConfig {
  allowlist: string[];
  blocklist: string[];
  allowUnlistedCommands: boolean;
  allowDangerousCommands: boolean;
}

interface ShellExecutorConfig {
  defaultTimeout: number;
  maxRetries: number;
  security: ShellExecutorSecurityConfig;
}

interface WebToolsConfig {
  requestTimeout: number;
  maxContentLength: number;
  userAgent: string;
  enableCache: boolean;
}

interface ToolsConfig {
  shellExecutor: ShellExecutorConfig;
  webTools: WebToolsConfig;
  tavilyApiKey?: string;
}

export interface Config {
  models: ModelConfig[];
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  tools: ToolsConfig;
  customContext?: string;
  mcpServers?: Record<string, McpServerConfig>;
}

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

  public constructor() {
    this.globalConfigDir = path.join(os.homedir(), '.tempurai');
    this.globalConfigFilePath = path.join(this.globalConfigDir, 'config.json');
    this.globalContextFilePath = path.join(this.globalConfigDir, '.tempurai.md');

    this.projectConfigDir = path.join(process.cwd(), '.tempurai');
    this.projectConfigFilePath = path.join(this.projectConfigDir, 'config.json');
    this.projectContextFilePath = path.join(this.projectConfigDir, '.tempurai.md');

    this.deepMerge = deepmergeFactory({
      mergeArray: (opts) => (target: any[], source: any[]) => opts.clone(source)
    });

    this.config = this.loadConfiguration();
  }

  public getConfig(): Config {
    return { ...this.config };
  }

  public async updateConfig(updates: Partial<Config>, saveToProject: boolean = false): Promise<void> {
    try {
      this.config = this.deepMerge(this.config, updates);

      const targetConfigDir = saveToProject ? this.projectConfigDir : this.globalConfigDir;
      const targetConfigPath = saveToProject ? this.projectConfigFilePath : this.globalConfigFilePath;

      await this.ensureConfigDirectory(targetConfigDir);

      const configJson = JSON.stringify(this.config, null, 2);
      await fs.promises.writeFile(targetConfigPath, configJson, 'utf8');

      const location = saveToProject ? 'project' : 'global';
      console.log(`Configuration updated and saved to ${location} config: ${targetConfigPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update configuration: ${errorMessage}`);
    }
  }

  public reloadConfig(): Config {
    this.config = this.loadConfiguration();
    return this.getConfig();
  }

  public getConfigPath(project: boolean = false): string {
    return project ? this.projectConfigFilePath : this.globalConfigFilePath;
  }

  public getContextPath(project: boolean = false): string {
    return project ? this.projectContextFilePath : this.globalContextFilePath;
  }

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

  private loadCustomContext(): string | undefined {
    // 优先加载项目上下文
    try {
      if (fs.existsSync(this.projectContextFilePath)) {
        const contextContent = fs.readFileSync(this.projectContextFilePath, 'utf8');
        const content = contextContent.trim();
        if (content) {
          return content;
        }
      }
    } catch (error) {
      console.warn(`Failed to load project context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 回退到全局上下文
    try {
      if (fs.existsSync(this.globalContextFilePath)) {
        const contextContent = fs.readFileSync(this.globalContextFilePath, 'utf8');
        const content = contextContent.trim();
        if (content) {
          return content;
        }
      }
    } catch (error) {
      console.warn(`Failed to load global context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return undefined;
  }

  private loadConfiguration(): Config {
    let globalConfig: Partial<Config> | null = null;
    let projectConfig: Partial<Config> | null = null;

    const initializer = new ConfigInitializer();

    // 加载全局配置
    if (initializer.globalConfigExists()) {
      try {
        const globalConfigContent = fs.readFileSync(this.globalConfigFilePath, 'utf8');
        globalConfig = JSON.parse(globalConfigContent);
        console.log(`Loaded global config from ${this.globalConfigFilePath}`);
      } catch (error) {
        throw new Error(`Failed to load global config: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // 加载项目配置
    if (!initializer.projectConfigExists()) {
      initializer.createProjectFiles();
    }

    if (fs.existsSync(this.projectConfigFilePath)) {
      try {
        const projectConfigContent = fs.readFileSync(this.projectConfigFilePath, 'utf8');
        projectConfig = JSON.parse(projectConfigContent);
        console.log(`Loaded project config from ${this.projectConfigFilePath}`);
      } catch (error) {
        console.warn(`Failed to load project config: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // 合并配置
    let mergedConfig = globalConfig as Config;
    mergedConfig = this.deepMerge(mergedConfig ?? {}, projectConfig);

    // 加载自定义上下文
    mergedConfig.customContext = this.loadCustomContext();

    return mergedConfig;
  }

  private async ensureConfigDirectory(configDir: string): Promise<void> {
    try {
      await fs.promises.mkdir(configDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create config directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public getModelDisplayName(): string {
    if (!this.config.models || this.config.models.length === 0) {
      return 'No models configured';
    }
    const firstModel = this.config.models[0];
    return `${firstModel.provider}:${firstModel.name}`;
  }
}