/**
 * 应用启动器
 * 统一管理应用的初始化、依赖注入和启动流程
 */

import 'reflect-metadata';
import { getContainer } from '../di/container.js';
import { TYPES } from '../di/types.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { SessionService } from '../session/SessionService.js';
import type { LanguageModel } from 'ai';
import { startInkUI } from './InkUI.js';

/**
 * 应用启动模式
 */
export enum LaunchMode {
  /** 代码编辑界面 (InkUI) - 主要模式 */
  CODE_EDITOR = 'code_editor',
  /** 系统命令模式 (CLI) - 辅助功能 */
  SYSTEM_COMMAND = 'system_command'
}

/**
 * 启动上下文
 */
export interface LaunchContext {
  mode: LaunchMode;
  args: string[];
  workingDirectory: string;
}

/**
 * 应用启动器类
 */
export class ApplicationBootstrap {
  private container = getContainer();

  /**
   * 验证配置和环境
   * @returns 验证结果
   */
  private async validateEnvironment(): Promise<{ valid: boolean; error?: string }> {
    try {
      const configLoader = this.container.get<ConfigLoader>(TYPES.ConfigLoader);

      // 验证配置
      const validation = configLoader.validateConfig();
      if (!validation.isValid) {
        return {
          valid: false,
          error: `配置验证失败: ${validation.errors.join(', ')}`
        };
      }

      // 验证模型配置
      try {
        const model = await this.container.getAsync<LanguageModel>(TYPES.LanguageModel);
      } catch (error) {
        return {
          valid: false,
          error: `模型配置验证失败: ${error instanceof Error ? error.message : '未知错误'}`
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `环境验证失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 启动代码编辑界面 (InkUI)
   */
  async launchCodeEditor(): Promise<void> {
    console.log('🎨 启动代码编辑界面...');

    // 验证环境
    const validation = await this.validateEnvironment();
    if (!validation.valid) {
      console.error('❌', validation.error);
      process.exit(1);
    }

    try {
      // 使用新的初始化工厂模式获取SessionService（会自动初始化所有依赖）
      const sessionServiceFactory = this.container.get<() => Promise<SessionService>>(TYPES.InitializedSessionService);
      const sessionService = await sessionServiceFactory();

      console.log('✅ 新的依赖注入架构已初始化');

      // 启动InkUI界面
      await startInkUI(sessionService);

    } catch (error) {
      console.error('❌ 启动代码编辑界面失败:', error instanceof Error ? error.message : '未知错误');
      process.exit(1);
    }
  }

  /**
   * 处理系统命令
   * @param args 命令行参数
   */
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

  /**
   * 显示帮助信息
   */
  private displayHelp(): void {
    console.log('Tempurai - AI辅助编程CLI工具\\n');
    console.log('使用方法:');
    console.log('  tempurai              启动代码编辑界面 (主要模式)');
    console.log('  tempurai config       显示配置信息');
    console.log('  tempurai version      显示版本信息');
    console.log('  tempurai help         显示此帮助信息\\n');
    console.log('选项:');
    console.log('  -h, --help           显示帮助');
    console.log('  -v, --version        显示版本\\n');
    console.log('示例:');
    console.log('  tempurai             # 启动交互式代码编辑界面');
    console.log('  tempurai config      # 显示当前配置');
  }

  /**
   * 显示配置信息
   */
  private async displayConfig(): Promise<void> {
    const configLoader = this.container.get<ConfigLoader>(TYPES.ConfigLoader);
    const config = configLoader.getConfig();

    console.log('🔧 Tempurai 配置信息:');
    console.log(`   模型: ${configLoader.getModelDisplayName()}`);
    console.log(`   温度: ${config.temperature}`);
    console.log(`   最大Token: ${config.maxTokens}`);
    console.log(`   API密钥: ${config.apiKey ? '✅ 已加载' : '❌ 缺失'}`);
    console.log(`   自定义上下文: ${config.customContext ? '✅ 已加载' : '❌ 未找到'}`);
    console.log(`   网页搜索: ${config.tools.tavilyApiKey ? '✅ 启用' : '❌ 禁用'}`);
    console.log(`   配置文件: ${configLoader.getConfigPath()}`);
  }

  /**
   * 主启动方法
   * @param context 启动上下文
   */
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

/**
 * 解析命令行参数确定启动模式
 * @param args 命令行参数
 * @returns 启动上下文
 */
export function parseArguments(args: string[]): LaunchContext {
  const workingDirectory = process.cwd();

  // 如果没有参数，启动代码编辑界面
  if (args.length === 0) {
    return {
      mode: LaunchMode.CODE_EDITOR,
      args,
      workingDirectory
    };
  }

  // 有参数则是系统命令模式
  return {
    mode: LaunchMode.SYSTEM_COMMAND,
    args,
    workingDirectory
  };
}

/**
 * 应用启动入口函数
 * @param args 命令行参数
 */
export async function bootstrapApplication(args: string[] = []): Promise<void> {
  const context = parseArguments(args);
  const bootstrap = new ApplicationBootstrap();
  await bootstrap.launch(context);
}