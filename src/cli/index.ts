#!/usr/bin/env node

/**
 * Tempurai CLI - AI-assisted programming CLI tool
 * 全局安装后可通过 tempurai 命令使用
 */

import * as path from 'path';
import { ConfigLoader, Config } from '../config/ConfigLoader';
import { SimpleAgent } from '../agents/SimpleAgent';
import { globalConfirmationManager } from '../tools/ConfirmationManager';
import * as readline from 'readline';
import { ContextManager } from '../context/ContextManager';
import { ProjectSummaryProvider } from '../context/providers/ProjectSummaryProvider';
import { ReactiveFileContextProvider } from '../context/providers/ReactiveFileContextProvider';
import { WatchedFilesContextProvider } from '../context/providers/WatchedFilesContextProvider';
import { FileWatcherService } from '../services/FileWatcherService';
import { extractFilePaths } from './InputPreprocessor';

/**
 * CLI状态枚举
 */
enum CLIState {
  SECURITY_CONFIRMATION = 'security_confirmation',
  WELCOME = 'welcome', 
  INTERACTIVE = 'interactive',
  PROCESSING = 'processing'
}

/**
 * 对话历史项接口
 */
interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// 定义IDE上下文，用于模拟编辑器状态
interface CursorPosition {
  line: number;
  character: number;
}

interface OpenFile {
  path: string;
  cursorPosition?: CursorPosition; // 可选的光标位置
}

interface IDEContext {
  activeFile?: OpenFile;
  openFiles: OpenFile[];
}

/**
 * Tempurai CLI主类
 */
export class TempuraiCLI {
  private readonly agent: SimpleAgent;
  private readonly rl: readline.Interface;
  private readonly config: Config;
  private readonly reactiveFileContextProvider: ReactiveFileContextProvider;
  private readonly watchedFilesContextProvider: WatchedFilesContextProvider;
  private readonly fileWatcherService: FileWatcherService;
  private history: HistoryItem[] = [];
  private currentState: CLIState = CLIState.SECURITY_CONFIRMATION;
  private isProcessing: boolean = false;
  private readonly workingDirectory: string;
  private readonly gitBranch: string = 'main';
  private ideContext: IDEContext = { openFiles: [] }; // IDE上下文状态

  constructor(
    config: Config, 
    agent: SimpleAgent, 
    reactiveFileContextProvider: ReactiveFileContextProvider,
    watchedFilesContextProvider: WatchedFilesContextProvider,
    fileWatcherService: FileWatcherService
  ) {
    this.config = config;
    this.agent = agent;
    this.reactiveFileContextProvider = reactiveFileContextProvider;
    this.watchedFilesContextProvider = watchedFilesContextProvider;
    this.fileWatcherService = fileWatcherService;
    this.workingDirectory = process.cwd();
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });

    this.setupConfirmationManager();
    
    // 异步初始化 MCP 工具
    this.initializeMcpTools();
  }

  /**
   * 异步初始化 MCP 工具
   */
  private async initializeMcpTools(): Promise<void> {
    try {
      await this.agent.initializeAsync();
    } catch (error) {
      console.error('⚠️ MCP 工具初始化失败，将继续使用基础功能:', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 设置确认管理器
   */
  private setupConfirmationManager(): void {
    globalConfirmationManager.setConfirmationHandler((request) => {
      this.handleConfirmationRequest(request);
    });
  }

  /**
   * 处理确认请求
   */
  private handleConfirmationRequest(request: any): void {
    console.log('\n' + '─'.repeat(60));
    console.log(`🔒 Security Confirmation`);
    console.log('─'.repeat(60));
    
    if (request.options.command) {
      console.log(`Command: ${request.options.command}`);
      console.log(`Risk Level: ${request.options.riskLevel?.toUpperCase()}`);
    }
    
    console.log(`\n${request.options.message}`);
    console.log('\n1. Yes, proceed');
    console.log('2. No, cancel');
    
    this.rl.question('\nChoose (1-2): ', (answer) => {
      const choice = answer.trim();
      if (choice === '1' || choice.toLowerCase() === 'yes' || choice.toLowerCase() === 'y') {
        globalConfirmationManager.resolveConfirmation(request.id, 'approve');
      } else {
        globalConfirmationManager.resolveConfirmation(request.id, 'deny');
      }
    });
  }

  /**
   * 获取目录信息
   */
  private getDirectoryInfo(): string {
    const projectName = path.basename(this.workingDirectory);
    return `${projectName} git:(${this.gitBranch})`;
  }

  /**
   * 显示安全确认界面
   */
  private displaySecurityConfirmation(): void {
    this.clearScreen();
    console.log(`${this.getDirectoryInfo()} × tempurai\n`);
    
    console.log('┌────────────────────────────────────────────────────────────┐');
    console.log('│ Do you trust the files in this folder?                     │');
    console.log(`│   ${this.workingDirectory.padEnd(56)} │`);
    console.log('│                                                            │');
    console.log('│ Tempurai may read, write, or execute files in this        │');
    console.log('│ directory to help with your coding tasks.                 │');
    console.log('│                                                            │');
    console.log('│ 1. Yes, proceed                                            │');
    console.log('│ 2. No, exit                                                │');
    console.log('└────────────────────────────────────────────────────────────┘\n');
    
    this.rl.question('Choose (1-2): ', (answer) => {
      const choice = answer.trim();
      if (choice === '1' || choice.toLowerCase() === 'yes') {
        this.currentState = CLIState.WELCOME;
        this.displayWelcome();
      } else {
        console.log('\n👋 Goodbye!');
        process.exit(0);
      }
    });
  }

  /**
   * 显示欢迎界面
   */
  private displayWelcome(): void {
    this.clearScreen();
    console.log('┌────────────────────────────────────────────────────────────┐');
    console.log('│ ✨ Welcome to Tempurai!                                    │');
    console.log('│                                                            │');
    console.log('│   /help   for help                                         │');
    console.log('│   /status for your current setup                           │');
    console.log('│   /config show configuration                               │');
    console.log('│   /clear  clear conversation history                       │');
    console.log('│                                                            │');
    console.log(`│ cwd: ${this.workingDirectory.padEnd(51)} │`);
    console.log('└────────────────────────────────────────────────────────────┘\n');
    
    this.currentState = CLIState.INTERACTIVE;
    this.startInteractiveMode();
  }

  /**
   * 启动交互模式
   */
  private startInteractiveMode(): void {
    this.displayPrompt();
    
    this.rl.on('line', async (input: string) => {
      if (this.currentState !== CLIState.INTERACTIVE || this.isProcessing) {
        return;
      }
      
      await this.processInput(input.trim());
    });
  }

  /**
   * 显示提示符
   */
  private displayPrompt(): void {
    if (this.currentState === CLIState.INTERACTIVE && !this.isProcessing) {
      process.stdout.write('\n> ');
    }
  }

  /**
   * 处理用户输入
   */
  private async processInput(input: string): Promise<void> {
    if (!input) {
      this.displayPrompt();
      return;
    }

    if (this.handleSpecialCommands(input)) {
      return;
    }

    this.isProcessing = true;
    this.currentState = CLIState.PROCESSING;

    try {
      this.addToHistory('user', input);
      
      // 智能提取文件路径并注入上下文
      console.log('\n🔍 正在分析用户输入中的文件引用...');
      const extractedFilePaths = await extractFilePaths(input);
      
      if (extractedFilePaths.length > 0) {
        console.log(`📄 发现 ${extractedFilePaths.length} 个文件引用: ${extractedFilePaths.join(', ')}`);
        this.reactiveFileContextProvider.addFiles(extractedFilePaths);
        
        // 开始监听这些文件
        for (const filePath of extractedFilePaths) {
          const success = this.fileWatcherService.watchFile(filePath);
          if (success && this.fileWatcherService.isWatching(filePath)) {
            console.log(`👁️ 开始监听文件变更: ${filePath}`);
          }
        }
      }
      
      // 准备发送给Agent的消息，包含IDE上下文信息
      let messageToAgent = input;
      if (this.ideContext.activeFile || this.ideContext.openFiles.length > 0) {
        const contextInfo = this.formatIDEContext();
        messageToAgent = `${contextInfo}\n\n${input}`;
      }
      
      console.log('\n🤔 Processing your request...\n');
      console.log('📝 Response:');
      
      const stream = this.agent.processStream(messageToAgent);
      let fullResponse = '';
      
      for await (const event of stream) {
        // 只处理文本块事件用于显示
        if (event.type === 'text-chunk') {
          const newContent = event.content.substring(fullResponse.length);
          process.stdout.write(newContent);
          fullResponse = event.content;
        } else if (event.type === 'tool-call') {
          console.log(`\n🔧 使用工具: ${event.toolName}`);
        } else if (event.type === 'tool-result') {
          console.log(`✓ 工具执行完成: ${event.toolName}`);
        } else if (event.type === 'error') {
          console.error(`\n❌ ${event.content}`);
        }
      }
      
      if (!fullResponse.endsWith('\n')) {
        console.log('');
      }
      
      this.addToHistory('assistant', fullResponse);
      
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isProcessing = false;
      this.currentState = CLIState.INTERACTIVE;
      this.displayPrompt();
    }
  }

  /**
   * 处理特殊命令
   */
  private handleSpecialCommands(input: string): boolean {
    const command = input.toLowerCase();
    
    if (['exit', 'quit', '/exit', '/quit'].includes(command)) {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    }
    
    if (['/help', 'help'].includes(command)) {
      this.displayHelp();
      return true;
    }
    
    if (['/status', 'status'].includes(command)) {
      this.displayStatus();
      return true;
    }
    
    if (['/config', 'config'].includes(command)) {
      this.displayConfig();
      return true;
    }
    
    if (['/clear', 'clear'].includes(command)) {
      this.history = [];
      this.agent.clearLoopDetectionHistory(); // 同时清除循环检测历史
      console.log('\n✨ Conversation history and loop detection history cleared.');
      this.displayPrompt();
      return true;
    }
    
    if (['/loops', 'loops'].includes(command)) {
      this.displayLoopStats();
      return true;
    }
    
    // 处理 /context 命令
    if (input.startsWith('/context ')) {
      const filePath = input.substring(9).trim(); // 移除 '/context ' 前缀
      this.handleContextCommand(filePath);
      return true;
    }
    
    return false;
  }

  /**
   * 处理 /context 命令
   */
  private handleContextCommand(filePath: string): void {
    if (!filePath) {
      console.log('\n❌ Usage: /context <file_path>');
      console.log('   Example: /context src/app.ts');
      this.displayPrompt();
      return;
    }

    // 验证文件路径（基本检查）
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.resolve(filePath);

    try {
      // 检查文件是否存在
      if (!fs.existsSync(fullPath)) {
        console.log(`\n❌ File not found: ${filePath}`);
        this.displayPrompt();
        return;
      }

      // 检查是否是文件（不是目录）
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) {
        console.log(`\n❌ Path is not a file: ${filePath}`);
        this.displayPrompt();
        return;
      }

      // 更新IDE上下文
      const openFile: OpenFile = {
        path: filePath
      };

      // 如果文件不在打开文件列表中，添加它
      if (!this.ideContext.openFiles.find(f => f.path === filePath)) {
        this.ideContext.openFiles.push(openFile);
      }

      // 设置为活动文件
      this.ideContext.activeFile = openFile;

      console.log(`\n✅ Active file set to: ${filePath}`);
      console.log(`📁 Total open files: ${this.ideContext.openFiles.length}`);
      this.displayPrompt();

    } catch (error) {
      console.log(`\n❌ Error accessing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.displayPrompt();
    }
  }

  /**
   * 格式化IDE上下文信息为字符串
   */
  private formatIDEContext(): string {
    const contextParts: string[] = [];
    
    if (this.ideContext.activeFile) {
      contextParts.push(`[IDE Context] Active file: ${this.ideContext.activeFile.path}`);
    }
    
    if (this.ideContext.openFiles.length > 0) {
      const fileList = this.ideContext.openFiles.map(f => f.path).join(', ');
      contextParts.push(`[IDE Context] Open files: ${fileList}`);
    }
    
    if (contextParts.length === 0) {
      return '';
    }
    
    return contextParts.join('\n');
  }

  /**
   * 显示帮助信息
   */
  private displayHelp(): void {
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│ 📚 Available Commands:                                     │');
    console.log('│                                                            │');
    console.log('│   /help     - Show this help message                      │');
    console.log('│   /status   - Show current setup                          │');
    console.log('│   /config   - Show configuration                          │');
    console.log('│   /loops    - Show loop detection statistics              │');
    console.log('│   /context  - Set active file context (/context <path>)  │');
    console.log('│   /clear    - Clear conversation and loop history         │');
    console.log('│   /exit     - Exit the application                        │');
    console.log('│                                                            │');
    console.log('│ 🔧 I can help you with:                                   │');
    console.log('│   • File operations (find, search, read, write)           │');
    console.log('│   • Git operations (status, log, diff)                    │');
    console.log('│   • Code analysis and refactoring                         │');
    console.log('│   • General programming assistance                        │');
    console.log('│                                                            │');
    console.log('│ 🔄 Loop Detection:                                        │');
    console.log('│   • Prevents infinite tool execution cycles               │');
    console.log('│   • Detects repetitive patterns automatically             │');
    console.log('│   • Provides suggestions when loops are detected          │');
    console.log('└────────────────────────────────────────────────────────────┘');
    this.displayPrompt();
  }

  /**
   * 显示状态
   */
  private displayStatus(): void {
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│ 📊 Current Status:                                        │');
    console.log('│                                                            │');
    console.log(`│   Working Directory: ${this.workingDirectory.padEnd(40)} │`);
    console.log(`│   Git Branch: ${this.gitBranch.padEnd(47)} │`);
    console.log(`│   Conversation History: ${String(this.history.length).padEnd(35)} │`);
    console.log(`│   Processing: ${(this.isProcessing ? 'Yes' : 'No').padEnd(43)} │`);
    console.log('└────────────────────────────────────────────────────────────┘');
    this.displayPrompt();
  }

  /**
   * 显示配置
   */
  private displayConfig(): void {
    const mcpStatus = this.agent.getMcpStatus();
    const mcpInfo = `${mcpStatus.toolCount} loaded (${mcpStatus.connectionCount} connections)`;
    const configLoader = ConfigLoader.getInstance();
    const loopStats = this.agent.getLoopDetectionStats();
    
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│ 🔧 Configuration:                                         │');
    console.log('│                                                            │');
    console.log(`│   Model: ${configLoader.getModelDisplayName().padEnd(49)} │`);
    console.log(`│   Temperature: ${String(this.config.temperature).padEnd(43)} │`);
    console.log(`│   Max Tokens: ${String(this.config.maxTokens).padEnd(44)} │`);
    console.log(`│   API Key: ${(this.config.apiKey ? '✅ Loaded' : '❌ Missing').padEnd(46)} │`);
    console.log(`│   Custom Context: ${(this.config.customContext ? '✅ Loaded' : '❌ Not found').padEnd(39)} │`);
    console.log(`│   Web Search: ${(this.config.tavilyApiKey ? '✅ Enabled' : '❌ Disabled').padEnd(43)} │`);
    console.log(`│   MCP Tools: ${mcpInfo.padEnd(44)} │`);
    if (mcpStatus.tools.length > 0) {
      const toolsList = mcpStatus.tools.join(', ');
      console.log(`│     - ${toolsList.padEnd(51)} │`);
    }
    console.log('│                                                            │');
    console.log('│ 🔄 Loop Detection:                                        │');
    console.log(`│   Total Calls: ${String(loopStats.totalCalls).padEnd(43)} │`);
    console.log(`│   Unique Tools: ${String(loopStats.uniqueTools).padEnd(42)} │`);
    console.log(`│   History Length: ${String(loopStats.historyLength).padEnd(40)} │`);
    console.log(`│   Most Used Tool: ${(loopStats.mostUsedTool || 'None').padEnd(38)} │`);
    console.log('└────────────────────────────────────────────────────────────┘');
    this.displayPrompt();
  }

  /**
   * 显示循环检测统计信息
   */
  private displayLoopStats(): void {
    const stats = this.agent.getLoopDetectionStats();
    const timespan = stats.recentTimespan > 0 
      ? `${Math.round(stats.recentTimespan / 1000)}s`
      : 'N/A';
    
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│ 🔄 Loop Detection Statistics:                             │');
    console.log('│                                                            │');
    console.log(`│   Total Tool Calls: ${String(stats.totalCalls).padEnd(39)} │`);
    console.log(`│   Unique Tools Used: ${String(stats.uniqueTools).padEnd(38)} │`);
    console.log(`│   History Length: ${String(stats.historyLength).padEnd(41)} │`);
    console.log(`│   Session Timespan: ${timespan.padEnd(39)} │`);
    console.log(`│   Most Used Tool: ${(stats.mostUsedTool || 'None').padEnd(39)} │`);
    console.log('│                                                            │');
    console.log('│ Commands:                                                  │');
    console.log('│   /clear  - Clear history and reset loop detection        │');
    console.log('└────────────────────────────────────────────────────────────┘');
    this.displayPrompt();
  }

  /**
   * 添加到历史
   */
  private addToHistory(role: 'user' | 'assistant', content: string): void {
    this.history.push({
      role,
      content,
      timestamp: new Date()
    });
    
    if (this.history.length > 50) {
      this.history = this.history.slice(-50);
    }
  }

  /**
   * 清屏
   */
  private clearScreen(): void {
    console.clear();
  }

  /**
   * 启动CLI
   */
  public start(): void {
    this.rl.on('close', () => {
      console.log('\n\n👋 Thanks for using Tempurai!');
      process.exit(0);
    });
    
    this.rl.on('SIGINT', () => {
      if (this.isProcessing) {
        console.log('\n⚠️ Processing interrupted by user');
        this.isProcessing = false;
        this.currentState = CLIState.INTERACTIVE;
        this.displayPrompt();
      } else {
        console.log('\n\n👋 Goodbye!');
        this.rl.close();
      }
    });
    
    this.displaySecurityConfirmation();
  }
}

/**
 * 处理子命令
 */
function handleSubcommands(args: string[], config: Config): boolean {
  const [subcommand, ...subArgs] = args;
  
  switch (subcommand) {
    case 'config':
      const configLoader = ConfigLoader.getInstance();
      console.log('🔧 Tempurai Configuration:');
      console.log(`   Model: ${configLoader.getModelDisplayName()}`);
      console.log(`   Temperature: ${config.temperature}`);
      console.log(`   Max Tokens: ${config.maxTokens}`);
      console.log(`   API Key: ${config.apiKey ? '✅ Loaded' : '❌ Missing'}`);
      console.log(`   Custom Context: ${config.customContext ? '✅ Loaded' : '❌ Not found'}`);
      return true;
      
    case 'version':
    case '--version':
    case '-v':
      const pkg = require('../../package.json');
      console.log(`tempurai v${pkg.version}`);
      return true;
      
    case 'help':
    case '--help':
    case '-h':
      displayMainHelp();
      return true;
      
    default:
      if (subcommand && subcommand.startsWith('-')) {
        console.error(`Unknown option: ${subcommand}`);
        console.log('Run "tempurai --help" for usage information.');
        process.exit(1);
      }
      return false;
  }
}

/**
 * 显示主帮助信息
 */
function displayMainHelp(): void {
  console.log('Tempurai - AI-assisted programming CLI tool\n');
  console.log('Usage:');
  console.log('  tempurai              Start interactive mode');
  console.log('  tempurai config       Show configuration');
  console.log('  tempurai version      Show version');
  console.log('  tempurai help         Show this help\n');
  console.log('Options:');
  console.log('  -h, --help           Show help');
  console.log('  -v, --version        Show version\n');
  console.log('Examples:');
  console.log('  tempurai             # Start interactive CLI');
  console.log('  tempurai config      # Show current config');
}

/**
 * 验证模型配置
 */
async function validateModelConfig(configLoader: ConfigLoader): Promise<boolean> {
  try {
    // 尝试创建语言模型实例以验证配置
    await configLoader.createLanguageModel();
    return true;
  } catch (error) {
    console.error('❌ Model configuration validation failed:');
    console.error(`   ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('💡 Please check your model configuration and API keys in:');
    console.error(`   ${configLoader.getConfigPath()}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    const configLoader = ConfigLoader.getInstance();
    const config = configLoader.getConfig();
    
    const args = process.argv.slice(2);
    
    // 先处理不需要配置验证的子命令
    if (args.length > 0) {
      const [subcommand] = args;
      
      if (['version', '--version', '-v'].includes(subcommand)) {
        const pkg = require('../../package.json');
        console.log(`tempurai v${pkg.version}`);
        return;
      }
      
      if (['help', '--help', '-h'].includes(subcommand)) {
        displayMainHelp();
        return;
      }
    }
    
    // 验证配置（交互模式需要）
    const validation = configLoader.validateConfig();
    if (!validation.isValid) {
      console.error('❌ Configuration validation failed:');
      validation.errors.forEach((error: string) => console.error(`   - ${error}`));
      process.exit(1);
    }
    
    // 处理其他子命令
    if (handleSubcommands(args, config)) {
      return;
    }
    
    // 验证模型配置（交互模式需要）
    if (!await validateModelConfig(configLoader)) {
      process.exit(1);
    }
    
    // 创建语言模型实例
    console.log('🔄 正在初始化AI模型...');
    const model = await configLoader.createLanguageModel();
    console.log(`✅ 模型已初始化: ${configLoader.getModelDisplayName()}`);
    
    // 创建上下文管理器并注册项目摘要提供者
    const contextManager = new ContextManager({
        verbose: false, // 可以根据需要开启详细日志
        timeout: 3000,  // 3秒超时
        maxTotalLength: 15000, // 15k字符限制
        includeMetadata: true
    });
    
    // 注册项目摘要提供者
    const projectSummaryProvider = new ProjectSummaryProvider();
    contextManager.registerProvider(projectSummaryProvider);
    
    // 创建文件监听服务
    const fileWatcherService = new FileWatcherService({
      verbose: false, // 可以根据需要开启详细日志
      debounceMs: 500, // 500ms防抖
      maxWatchedFiles: 50 // 最多监听50个文件
    });
    console.log('✅ 文件监听服务已创建');
    
    // 注册响应式文件上下文提供者
    const reactiveFileContextProvider = new ReactiveFileContextProvider();
    contextManager.registerProvider(reactiveFileContextProvider);
    
    // 注册监听文件上下文提供者
    const watchedFilesContextProvider = new WatchedFilesContextProvider(fileWatcherService);
    contextManager.registerProvider(watchedFilesContextProvider);
    
    console.log('✅ 上下文管理器已初始化，并注册了所有上下文提供者');
    
    // 创建Agent实例（现在需要传递 ContextManager）
    const agent = new SimpleAgent(config, model, contextManager, config.customContext);
    console.log('✅ Agent已创建，正在进行异步初始化...');
    
    // 启动交互模式
    const cli = new TempuraiCLI(
      config, 
      agent, 
      reactiveFileContextProvider, 
      watchedFilesContextProvider,
      fileWatcherService
    );
    cli.start();
    
  } catch (error) {
    console.error('❌ Failed to start tempurai:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// 错误处理
process.on('unhandledRejection', (reason: unknown) => {
  console.error('💥 Unhandled Promise Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// 只有直接执行时才运行main
if (require.main === module) {
  main().catch((error: Error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}