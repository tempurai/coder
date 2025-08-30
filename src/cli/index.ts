#!/usr/bin/env node

/**
 * Tempurai CLI - AI-assisted programming CLI tool
 * 全局安装后可通过 tempurai 命令使用
 */

import * as path from 'path';
import { ConfigLoader, Config } from '../config/ConfigLoader';
import { SimpleAgent } from '../agents/SimpleAgent';
import * as readline from 'readline';
import { FileWatcherService } from '../services/FileWatcherService';
import { SessionService, TaskExecutionResult } from '../session/SessionService';

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
 * 对话历史项接口（用于向后兼容显示）
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
  private readonly sessionService: SessionService;
  private readonly rl: readline.Interface;
  private readonly config: Config;
  private readonly configLoader: ConfigLoader;
  private history: HistoryItem[] = []; // 保留用于UI显示
  private currentState: CLIState = CLIState.SECURITY_CONFIRMATION;
  private isProcessing: boolean = false;
  private readonly workingDirectory: string;
  private gitBranch: string = 'main';
  private ideContext: IDEContext = { openFiles: [] }; // IDE上下文状态

  constructor(
    config: Config, 
    configLoader: ConfigLoader,
    sessionService: SessionService
  ) {
    this.config = config;
    this.configLoader = configLoader;
    this.sessionService = sessionService;
    this.workingDirectory = process.cwd();
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });
    
    // 异步初始化 MCP 工具
    this.initializeMcpTools();
  }

  /**
   * 异步初始化 MCP 工具
   */
  private async initializeMcpTools(): Promise<void> {
    // MCP工具初始化现在由SessionService管理
    // 这里保留方法用于向后兼容
    console.log('🔄 MCP工具由会话服务管理');
  }

  /**
   * 获取目录信息
   */
  private getDirectoryInfo(): string {
    // 尝试动态获取Git分支
    this.updateGitBranch();
    const projectName = path.basename(this.workingDirectory);
    return `${projectName} git:(${this.gitBranch})`;
  }
  
  /**
   * 更新Git分支信息
   */
  private updateGitBranch(): void {
    try {
      const { exec } = require('child_process');
      exec('git branch --show-current', { cwd: this.workingDirectory }, (error: any, stdout: string) => {
        if (!error && stdout.trim()) {
          this.gitBranch = stdout.trim();
        }
      });
    } catch (error) {
      // 保持默认分支名称
    }
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
      this.updateGitBranch(); // 更新分支信息
      const projectName = path.basename(this.workingDirectory);
      const promptPrefix = this.gitBranch !== 'main' && this.gitBranch !== 'master' 
        ? `\n${projectName} git:(${this.gitBranch})`
        : `\n${projectName}`;
      process.stdout.write(`${promptPrefix} > `);
    }
  }

  /**
   * 处理用户输入（新架构 - 简化版）
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
      console.log('\n🚀 开始处理任务...');
      
      // 使用SessionService处理任务（新架构）
      const result: TaskExecutionResult = await this.sessionService.processTask(input);
      
      // 显示任务结果
      this.displayTaskResult(result);
      
      // 为UI显示保留简化的历史记录
      this.addToHistory('user', input);
      this.addToHistory('assistant', result.summary);
      
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isProcessing = false;
      this.currentState = CLIState.INTERACTIVE;
      this.displayPrompt();
    }
  }

  /**
   * 显示任务执行结果
   */
  private displayTaskResult(result: TaskExecutionResult): void {
    console.log('\n' + '─'.repeat(60));
    
    if (result.success) {
      console.log('✅ 任务执行成功');
      console.log(`📝 任务: ${result.taskDescription}`);
      console.log(`⏱️ 执行时间: ${result.duration}ms`);
      console.log(`🔄 迭代次数: ${result.iterations}`);
      console.log(`📊 总结: ${result.summary}`);
      
      if (result.diff && result.diff.filesChanged > 0) {
        console.log(`\n📁 文件变更: ${result.diff.filesChanged} 个文件`);
        console.log('📊 变更统计:');
        console.log(result.diff.diffStats);
        
        // 如果diff不太长，显示完整diff
        if (result.diff.fullDiff && result.diff.fullDiff.length < 2000) {
          console.log('\n🔍 详细变更:');
          console.log(result.diff.fullDiff);
        } else {
          console.log('\n💡 完整变更太长，已省略。使用 git diff 查看详细内容。');
        }
      } else {
        console.log('\n📁 没有文件变更');
      }
    } else {
      console.log('❌ 任务执行失败');
      console.log(`📝 任务: ${result.taskDescription}`);
      console.log(`⏱️ 执行时间: ${result.duration}ms`);
      console.log(`🔄 迭代次数: ${result.iterations}`);
      console.log(`📊 总结: ${result.summary}`);
      
      if (result.error) {
        console.log(`🚫 错误: ${result.error}`);
      }
    }
    
    console.log('─'.repeat(60));
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
      this.history = []; // 清除UI显示历史
      this.sessionService.clearSession(); // 清除会话服务历史
      console.log('\n✨ Conversation history and loop detection history cleared.');
      this.displayPrompt();
      return true;
    }
    
    if (['/loops', 'loops'].includes(command)) {
      this.displayLoopStats();
      return true;
    }
    
    if (['/session', 'session'].includes(command)) {
      this.displaySessionStats();
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
    console.log('│   /session  - Show session statistics                     │');
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
    const sessionStats = this.sessionService.getSessionStats();
    const mcpStatus = sessionStats.mcpStatus;
    const mcpInfo = `${mcpStatus.toolCount} loaded (${mcpStatus.connectionCount} connections)`;
    const loopStats = sessionStats.loopDetectionStats;
    
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│ 🔧 Configuration:                                         │');
    console.log('│                                                            │');
    console.log(`│   Model: ${this.getModelDisplayName().padEnd(49)} │`);
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
   * 显示会话统计信息
   */
  private displaySessionStats(): void {
    const stats = this.sessionService.getSessionStats();
    const fileWatcherStats = this.sessionService.getFileWatcherStats();
    
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│ 📊 Session Statistics:                                  │');
    console.log('│                                                            │');
    console.log(`│   Total Interactions: ${String(stats.totalInteractions).padEnd(35)} │`);
    console.log(`│   Total Tokens Used: ${String(stats.totalTokensUsed).padEnd(36)} │`);
    console.log(`│   Average Response Time: ${String(stats.averageResponseTime)}ms`.padEnd(59) + ' │');
    console.log(`│   Unique Files Accessed: ${String(stats.uniqueFilesAccessed).padEnd(33)} │`);
    console.log(`│   Session Duration: ${String(stats.sessionDuration)}s`.padEnd(59) + ' │');
    console.log('│                                                            │');
    console.log('│ 📁 File Watching:                                        │');
    console.log(`│   Watched Files: ${String(fileWatcherStats.watchedFileCount).padEnd(42)} │`);
    console.log(`│   Recent Changes: ${String(fileWatcherStats.recentChangesCount).padEnd(41)} │`);
    console.log(`│   Total Change Events: ${String(fileWatcherStats.totalChangeEvents).padEnd(35)} │`);
    console.log('│                                                            │');
    console.log('│ Commands:                                                  │');
    console.log('│   /session - Show this session statistics                   │');
    console.log('│   /clear   - Clear session history                          │');
    console.log('└────────────────────────────────────────────────────────────┘');
    this.displayPrompt();
  }

  /**
   * 显示循环检测统计信息
   */
  private displayLoopStats(): void {
    const sessionStats = this.sessionService.getSessionStats();
    const stats = sessionStats.loopDetectionStats;
    const timespan = sessionStats.sessionDuration > 0 
      ? `${sessionStats.sessionDuration}s`
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
   * 获取模型显示名称
   */
  private getModelDisplayName(): string {
    return this.configLoader.getModelDisplayName();
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
function handleSubcommands(args: string[], config: Config, configLoader: ConfigLoader): boolean {
  const [subcommand, ...subArgs] = args;
  
  switch (subcommand) {
    case 'config':
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
    const configLoader = new ConfigLoader();
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
    if (handleSubcommands(args, config, configLoader)) {
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
    
    // 创建文件监听服务
    const fileWatcherService = new FileWatcherService({
      verbose: false, // 可以根据需要开启详细日志
      debounceMs: 500, // 500ms防抖
      maxWatchedFiles: 50 // 最多监听50个文件
    });
    console.log('✅ 文件监听服务已创建');
    
    // 创建Agent实例（使用新的ProjectContext系统）
    const agent = new SimpleAgent(config, model, config.customContext);
    console.log('✅ Agent已创建，开始异步初始化...');
    
    // 等待Agent完全初始化
    await agent.initializeAsync(config.customContext);
    console.log('✅ Agent异步初始化完成');
    
    // 验证初始化状态
    const initStatus = agent.getInitializationStatus();
    if (!initStatus.allLoaded) {
        console.warn('⚠️ Agent初始化不完整，某些功能可能受限');
        if (initStatus.error) {
            console.warn(`⚠️ 初始化错误: ${initStatus.error}`);
        }
    } else {
        console.log(`✅ 所有工具已加载完成 (${initStatus.toolCount}个工具)`);
    }
    
    // 创建会话管理服务（使用新的依赖注入接口）
    const sessionService = new SessionService({
      agent,
      fileWatcher: fileWatcherService,
      config
    });
    console.log('✅ 会话管理服务已初始化');
    
    console.log('✅ 新的架构已初始化：CLI ↔ SessionService ↔ Agent');
    
    // 启动交互模式
    const cli = new TempuraiCLI(config, configLoader, sessionService);
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