import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { injectable } from 'inversify';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
  source?: string;
}

@injectable()
export class Logger {
  private logLevel: LogLevel = LogLevel.INFO;
  private logDir: string;
  private logFile: string;
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };

  constructor() {
    // 确定日志目录 - 优先使用项目级别，否则使用全局
    const projectLogDir = path.join(process.cwd(), '.tempurai');
    const globalLogDir = path.join(os.homedir(), '.tempurai');
    
    // 检查项目目录是否存在或可以创建
    try {
      fs.mkdirSync(projectLogDir, { recursive: true });
      this.logDir = projectLogDir;
    } catch {
      // 如果项目目录创建失败，使用全局目录
      fs.mkdirSync(globalLogDir, { recursive: true });
      this.logDir = globalLogDir;
    }

    const dateStr = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `tempurai-${dateStr}.log`);

    // 保存原始console方法
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console)
    };

    this.initLogFile();
    this.interceptConsole();
  }

  private initLogFile(): void {
    try {
      if (!fs.existsSync(this.logFile)) {
        const welcomeEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: 'Tempurai logging system initialized',
          data: {
            logFile: this.logFile,
            pid: process.pid,
            version: process.version
          }
        };
        fs.writeFileSync(this.logFile, JSON.stringify(welcomeEntry) + '\n', 'utf8');
      }
    } catch (error) {
      // 如果无法写入日志文件，至少在控制台输出错误
      this.originalConsole.error('Failed to initialize log file:', error);
    }
  }

  private writeToFile(entry: LogEntry): void {
    try {
      const logLine = JSON.stringify(entry, null, 0) + '\n';
      fs.appendFileSync(this.logFile, logLine, 'utf8');
    } catch (error) {
      // 静默处理文件写入错误，避免无限循环
    }
  }

  private formatMessage(...args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }

  private interceptConsole(): void {
    // 拦截console.log并重定向到logger
    console.log = (...args: any[]) => {
      const message = this.formatMessage(...args);
      this.log(LogLevel.INFO, message);
      // 不再输出到原始控制台，只记录到文件
    };

    // 拦截console.info
    console.info = (...args: any[]) => {
      const message = this.formatMessage(...args);
      this.log(LogLevel.INFO, message);
    };

    // 拦截console.warn
    console.warn = (...args: any[]) => {
      const message = this.formatMessage(...args);
      this.log(LogLevel.WARN, message);
    };

    // 拦截console.error
    console.error = (...args: any[]) => {
      const message = this.formatMessage(...args);
      this.log(LogLevel.ERROR, message);
    };

    // 拦截console.debug
    console.debug = (...args: any[]) => {
      const message = this.formatMessage(...args);
      this.log(LogLevel.DEBUG, message);
    };
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public log(level: LogLevel, message: string, data?: any, source?: string): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      data,
      source
    };

    this.writeToFile(entry);
  }

  public debug(message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, message, data, source);
  }

  public info(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, message, data, source);
  }

  public warn(message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, message, data, source);
  }

  public error(message: string, data?: any, source?: string): void {
    this.log(LogLevel.ERROR, message, data, source);
  }

  // 专门用于记录模型请求的方法
  public logModelRequest(provider: string, model: string, prompt: string, response?: string, metadata?: any): void {
    this.info('Model Request', {
      provider,
      model,
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
      responseLength: response?.length,
      responsePreview: response ? response.substring(0, 200) + (response.length > 200 ? '...' : '') : undefined,
      metadata
    }, 'MODEL');
  }

  // 专门用于记录工具执行的方法
  public logToolExecution(toolName: string, parameters: any, result?: any, error?: Error): void {
    this.info('Tool Execution', {
      toolName,
      parameters,
      success: !error,
      result: result ? (typeof result === 'string' ? result.substring(0, 500) : result) : undefined,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : undefined
    }, 'TOOL');
  }

  // 专门用于记录用户交互的方法
  public logUserInteraction(action: string, data?: any): void {
    this.info('User Interaction', {
      action,
      data
    }, 'USER');
  }

  public getLogFile(): string {
    return this.logFile;
  }

  // 恢复原始console（用于清理）
  public restoreConsole(): void {
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
  }

  // 清理旧的日志文件（保留最近7天）
  public cleanupOldLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir);
      const logFiles = files.filter(file => file.startsWith('tempurai-') && file.endsWith('.log'));
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          this.info('Cleaned up old log file', { file }, 'CLEANUP');
        }
      }
    } catch (error) {
      this.error('Failed to cleanup old logs', { error: error instanceof Error ? error.message : error }, 'CLEANUP');
    }
  }
}

// 创建全局Logger实例
export const logger = new Logger();