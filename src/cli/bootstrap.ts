import 'reflect-metadata';
import { getContainer } from '../di/container.js';
import { TYPES } from '../di/types.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { SessionServiceFactory } from '../di/interfaces.js';
import { ProjectIndexer } from '../indexing/ProjectIndexer.js';
import type { LanguageModel } from 'ai';
import { startInkUI } from './InkUI.js';
import { Logger } from '../utils/Logger.js';

export enum LaunchMode {
  CODE_EDITOR = 'code_editor',
  SYSTEM_COMMAND = 'system_command'
}

export interface LaunchContext {
  mode: LaunchMode;
  args: string[];
  workingDirectory: string;
}

export class ApplicationBootstrap {
  private container = getContainer();
  private logger: Logger;
  private currentSession?: { sessionService: any; clearSession(): void };

  constructor() {
    this.logger = this.container.get<Logger>(TYPES.Logger);
    this.logger.info('Application bootstrap started');
    this.logger.cleanupOldLogs();
  }

  private async validateEnvironment(): Promise<{ valid: boolean; error?: string }> {
    this.logger.info('Starting environment validation');

    try {
      const configLoader = this.container.get<ConfigLoader>(TYPES.ConfigLoader);

      // 验证配置
      const validation = configLoader.validateConfig();
      if (!validation.isValid) {
        const error = `配置验证失败: ${validation.errors.join(', ')}`;
        this.logger.error('Configuration validation failed', { errors: validation.errors });
        return {
          valid: false,
          error
        };
      }

      // 验证模型配置
      try {
        const model = await this.container.getAsync<LanguageModel>(TYPES.LanguageModel);
        this.logger.info('Model configuration validated successfully');
      } catch (error) {
        const errorMessage = `模型配置验证失败: ${error instanceof Error ? error.message : '未知错误'}`;
        this.logger.error('Model configuration validation failed', { error: error instanceof Error ? error.message : error });
        return {
          valid: false,
          error: errorMessage
        };
      }

      this.logger.info('Environment validation completed successfully');
      return { valid: true };
    } catch (error) {
      const errorMessage = `环境验证失败: ${error instanceof Error ? error.message : '未知错误'}`;
      this.logger.error('Environment validation failed', { error: error instanceof Error ? error.message : error });
      return {
        valid: false,
        error: errorMessage
      };
    }
  }

  async launchCodeEditor(): Promise<void> {
    console.log('🎨 启动代码编辑界面...');
    this.logger.info('Launching code editor interface');

    // 验证环境
    const validation = await this.validateEnvironment();
    if (!validation.valid) {
      console.error('❌', validation.error);
      this.logger.error('Failed to launch code editor', { reason: validation.error });
      process.exit(1);
    }

    try {
      // 创建新的会话
      const sessionFactory = this.container.get<SessionServiceFactory>(TYPES.SessionServiceFactory);
      this.currentSession = sessionFactory();

      console.log('✅ 新的依赖注入架构已初始化');
      this.logger.info('Dependency injection architecture initialized successfully');

      // 启动控制台拦截
      this.logger.interceptConsole();

      // 启动UI
      this.logger.info('Starting Ink UI interface');
      await startInkUI(this.currentSession.sessionService);
    } catch (error) {
      console.error('❌ 启动代码编辑界面失败:', error instanceof Error ? error.message : '未知错误');
      this.logger.error('Failed to launch code editor interface', { error: error instanceof Error ? error.message : error });
      process.exit(1);
    }
  }

  clearCurrentSession(): void {
    if (this.currentSession) {
      this.currentSession.clearSession();
      this.currentSession = undefined;
      this.logger.info('Session cleared');
    }
  }

  async handleSystemCommand(args: string[]): Promise<void> {
    const [command, ...subArgs] = args;
    const configLoader = this.container.get<ConfigLoader>(TYPES.ConfigLoader);

    try {
      switch (command) {
        case 'version':
        case '--version':
        case '-v':
          const { readFileSync } = await import('fs');
          const { join } = await import('path');
          const { fileURLToPath } = await import('url');
          const __dirname = fileURLToPath(new URL('.', import.meta.url));
          const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
          console.log(`tempurai v${pkg.version}`);
          break;

        case 'help':
        case '--help':
        case '-h':
          this.displayHelp();
          break;

        case 'config':
          await this.displayConfig();
          break;

        case 'index':
          await this.handleIndexCommand(subArgs);
          break;

        default:
          if (command && command.startsWith('-')) {
            console.error(`未知选项: ${command}`);
            console.log('运行 "tempurai --help" 查看使用说明。');
            process.exit(1);
          } else {
            console.error(`未知命令: ${command}`);
            console.log('运行 "tempurai --help" 查看使用说明。');
            process.exit(1);
          }
      }
    } catch (error) {
      console.error('❌ 系统命令执行失败:', error instanceof Error ? error.message : '未知错误');
      process.exit(1);
    }
  }

  private displayHelp(): void {
    console.log('Tempurai Coder - AI辅助编程CLI工具\\n');
    console.log('使用方法:');
    console.log('  coder              启动代码编辑界面 (主要模式)');
    console.log('  coder config       显示配置信息');
    console.log('  coder version      显示版本信息');
    console.log('  coder help         显示此帮助信息\\n');
    console.log('  coder index        分析项目结构并生成索引');
    console.log('选项:');
    console.log('  -h, --help           显示帮助');
    console.log('  -v, --version        显示版本\\n');
    console.log('示例:');
    console.log('  coder               # 启动交互式代码编辑界面');
    console.log('  coder config        # 显示当前配置');
  }

  private async displayConfig(): Promise<void> {
    const configLoader = this.container.get<ConfigLoader>(TYPES.ConfigLoader);
    const config = configLoader.getConfig();

    console.log('🔧 Tempurai Coder 配置信息:');
    console.log(`   模型: ${configLoader.getModelDisplayName()}`);
    console.log(`   温度: ${config.temperature}`);
    console.log(`   最大Token: ${config.maxTokens}`);
    console.log(`   API密钥: ${config.apiKey ? '✅ 已加载' : '❌ 缺失'}`);
    console.log(`   自定义上下文: ${config.customContext ? '✅ 已加载' : '❌ 未找到'}`);
    console.log(`   网页搜索: ${config.tools.tavilyApiKey ? '✅ 启用' : '❌ 禁用'}`);
    console.log(`   配置文件: ${configLoader.getConfigPath()}`);
  }

  private async handleIndexCommand(args: string[]): Promise<void> {
    const [mode] = args;

    try {
      const indexer = this.container.get<ProjectIndexer>(TYPES.ProjectIndexer);

      if (mode === '--full' || mode === '-f') {
        console.log('Starting full project analysis...');
        let result = await indexer.analyze({ force: true });
        console.log('Project index generation completed', result);
      } else {
        console.log('Starting incremental project analysis...');
        let result = await indexer.analyze({ force: false });
        console.log('Project index generation completed', result);
      }
    } catch (error) {
      console.error('Project index generation failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  async launch(context: LaunchContext): Promise<void> {
    console.log(`🚀 Tempurai 启动 (模式: ${context.mode})`);

    try {
      switch (context.mode) {
        case LaunchMode.CODE_EDITOR:
          await this.launchCodeEditor();
          break;

        case LaunchMode.SYSTEM_COMMAND:
          await this.handleSystemCommand(context.args);
          break;

        default:
          throw new Error(`未支持的启动模式: ${context.mode}`);
      }
    } catch (error) {
      console.error('💥 应用启动失败:', error instanceof Error ? error.message : '未知错误');
      process.exit(1);
    }
  }
}

export function parseArguments(args: string[]): LaunchContext {
  const workingDirectory = process.cwd();

  // 如果没有参数，启动代码编辑器
  if (args.length === 0) {
    return {
      mode: LaunchMode.CODE_EDITOR,
      args,
      workingDirectory
    };
  }

  // 否则处理为系统命令
  return {
    mode: LaunchMode.SYSTEM_COMMAND,
    args,
    workingDirectory
  };
}

export async function bootstrapApplication(args: string[] = []): Promise<void> {
  const context = parseArguments(args);
  const bootstrap = new ApplicationBootstrap();
  await bootstrap.launch(context);
}