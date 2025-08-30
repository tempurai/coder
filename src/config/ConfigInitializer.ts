import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { injectable } from 'inversify';

/**
 * 默认配置对象（从ConfigLoader导入的默认值）
 */
const DEFAULT_CONFIG = {
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
 * 配置文件初始化器
 * 负责创建默认配置文件和示例文件
 */
@injectable()
export class ConfigInitializer {
  private readonly globalConfigDir: string;
  private readonly globalConfigFilePath: string;
  private readonly globalContextFilePath: string;

  constructor() {
    this.globalConfigDir = path.join(os.homedir(), '.tempurai');
    this.globalConfigFilePath = path.join(this.globalConfigDir, 'config.json');
    this.globalContextFilePath = path.join(this.globalConfigDir, '.tempurai.md');
  }

  /**
   * 检查配置文件是否存在
   */
  configExists(): boolean {
    return fs.existsSync(this.globalConfigFilePath);
  }

  /**
   * 同步版本的配置文件创建（仅创建配置文件，不创建示例文件）
   */
  createConfigSync(): void {
    try {
      // 确保目录存在（同步）
      fs.mkdirSync(this.globalConfigDir, { recursive: true });

      // 创建配置文件
      this.createDefaultConfigFile();

      console.log(`📁 Created default configuration at ${this.globalConfigFilePath}`);
      console.log('💡 Please edit this file to add your API keys and customize settings.');
    } catch (error) {
      console.error(`❌ Failed to create default config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 初始化所有配置文件
   */
  async initializeConfig(): Promise<void> {
    if (this.configExists()) {
      return; // 配置已存在，不需要初始化
    }

    console.log('🔧 First time setup: Creating configuration files...');

    try {
      await this.ensureConfigDirectory();
      this.createDefaultConfigFile();
      this.createExampleContextFile();

      console.log(`📁 Created default configuration at ${this.globalConfigFilePath}`);
      console.log('💡 Please edit this file to add your API keys and customize settings.');

      console.log('✅ Configuration initialized successfully!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to initialize configuration: ${errorMessage}`);
      throw new Error(`Configuration initialization failed: ${errorMessage}`);
    }
  }

  /**
   * 静态方法：快速初始化配置（用于应用启动）
   */
  static async quickInitialize(): Promise<void> {
    const initializer = new ConfigInitializer();
    await initializer.initializeConfig();
  }

  /**
   * 确保配置目录存在
   */
  private async ensureConfigDirectory(): Promise<void> {
    try {
      await fs.promises.mkdir(this.globalConfigDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create config directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 创建默认配置文件
   */
  private createDefaultConfigFile(): void {
    const configContent = JSON.stringify(DEFAULT_CONFIG, null, 2);
    fs.writeFileSync(this.globalConfigFilePath, configContent, 'utf8');
  }

  /**
   * 创建示例上下文文件
   */
  private createExampleContextFile(): void {
    if (fs.existsSync(this.globalContextFilePath)) {
      return; // 文件已存在，不覆盖
    }

    const exampleContext = `# Tempurai Custom Context

This file allows you to provide additional context to the AI assistant.
Add any project-specific information, coding guidelines, or preferences here.

## Examples:

### Coding Style Preferences
- Use TypeScript with strict typing
- Prefer functional programming approaches
- Use meaningful variable names
- Include comprehensive error handling

### Project-Specific Guidelines
- Follow the existing architecture patterns
- Use the logging framework consistently
- Write tests for all new functionality
- Document public APIs

### Personal Preferences
- Explain complex code changes
- Suggest optimizations when appropriate
- Follow security best practices

You can edit this file anytime to customize how the AI assistant helps you.
For project-specific context, create ./.tempurai/directives.md in your project folder.
`;

    try {
      fs.writeFileSync(this.globalContextFilePath, exampleContext, 'utf8');
      console.log(`📄 Created example context file at ${this.globalContextFilePath}`);
    } catch (error) {
      console.warn(`⚠️ Could not create context file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取配置目录路径
   */
  getConfigDir(): string {
    return this.globalConfigDir;
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.globalConfigFilePath;
  }

  /**
   * 获取上下文文件路径
   */
  getContextPath(): string {
    return this.globalContextFilePath;
  }
}