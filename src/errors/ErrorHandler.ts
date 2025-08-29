import { 
  TempuraiError,
  ErrorCode,
  ErrorSeverity,
  RecoveryStrategy,
  ErrorContext,
  convertToTempuraiError,
  formatErrorMessage
} from './TempuraiError';

/**
 * 错误处理响应接口
 * 定义错误处理器返回的标准响应格式
 */
export interface ErrorResponse {
  /** 处理结果是否成功 */
  success: false;
  /** 用户友好的错误消息 */
  userMessage: string;
  /** 技术错误详情（用于调试） */
  technicalDetails: string;
  /** 错误编码 */
  errorCode: ErrorCode;
  /** 错误严重程度 */
  severity: ErrorSeverity;
  /** 恢复策略 */
  recoveryStrategy: RecoveryStrategy;
  /** 恢复建议 */
  recoveryAdvice: string[];
  /** 是否可以重试 */
  canRetry: boolean;
  /** 建议的重试延迟（毫秒） */
  retryDelay?: number;
  /** 错误上下文信息 */
  context: ErrorContext;
  /** 错误唯一标识符 */
  errorId: string;
}

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * 日志记录接口
 */
export interface Logger {
  debug(message: string, context?: any): void;
  info(message: string, context?: any): void;
  warn(message: string, context?: any): void;
  error(message: string, context?: any): void;
  fatal(message: string, context?: any): void;
}

/**
 * 默认控制台日志记录器
 */
class ConsoleLogger implements Logger {
  debug(message: string, context?: any): void {
    console.debug(`[DEBUG] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  info(message: string, context?: any): void {
    console.info(`[INFO] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  warn(message: string, context?: any): void {
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  error(message: string, context?: any): void {
    console.error(`[ERROR] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  fatal(message: string, context?: any): void {
    console.error(`[FATAL] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }
}

/**
 * 错误处理器配置接口
 */
export interface ErrorHandlerConfig {
  /** 是否在控制台输出详细错误信息 */
  verbose: boolean;
  /** 是否记录错误堆栈 */
  logStackTrace: boolean;
  /** 是否启用错误统计 */
  enableStatistics: boolean;
  /** 错误统计历史最大数量 */
  maxStatisticsHistory: number;
  /** 自定义日志记录器 */
  logger?: Logger;
  /** 自定义错误ID生成器 */
  errorIdGenerator?: () => string;
}

/**
 * 全局错误处理器
 * 提供统一的错误处理策略和用户体验
 */
export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private logger: Logger;
  private statisticsCollector: ErrorStatisticsCollector;
  private errorIdGenerator: () => string;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      verbose: false,
      logStackTrace: true,
      enableStatistics: true,
      maxStatisticsHistory: 100,
      ...config
    };

    this.logger = config.logger || new ConsoleLogger();
    this.statisticsCollector = new ErrorStatisticsCollector(this.config.maxStatisticsHistory);
    this.errorIdGenerator = config.errorIdGenerator || this.defaultErrorIdGenerator;
  }

  /**
   * 处理错误并返回标准化响应
   * @param error 要处理的错误
   * @param additionalContext 额外的上下文信息
   * @returns 标准化的错误响应
   */
  public handleError(error: Error | TempuraiError, additionalContext: ErrorContext = {}): ErrorResponse {
    // 转换为TempuraiError
    const tempuraiError = error instanceof TempuraiError ? 
      error : 
      convertToTempuraiError(error, additionalContext);

    // 合并上下文信息
    const mergedContext = { ...tempuraiError.context, ...additionalContext };
    const errorWithContext = tempuraiError.clone({ context: mergedContext });

    // 记录统计信息
    if (this.config.enableStatistics) {
      this.statisticsCollector.recordError(errorWithContext);
    }

    // 记录日志
    this.logError(errorWithContext);

    // 生成错误ID
    const errorId = this.errorIdGenerator();

    // 创建响应
    const response: ErrorResponse = {
      success: false,
      userMessage: this.formatUserMessage(errorWithContext),
      technicalDetails: this.formatTechnicalDetails(errorWithContext),
      errorCode: errorWithContext.code,
      severity: errorWithContext.severity,
      recoveryStrategy: errorWithContext.recoveryStrategy,
      recoveryAdvice: errorWithContext.recoveryAdvice,
      canRetry: errorWithContext.canRetry(),
      retryDelay: this.calculateRetryDelay(errorWithContext),
      context: mergedContext,
      errorId
    };

    return response;
  }

  /**
   * 格式化用户友好的错误消息
   * @param error TempuraiError实例
   * @returns 用户友好的错误消息
   */
  public formatUserMessage(error: TempuraiError): string {
    // 使用统一的错误消息格式
    return formatErrorMessage(error);
  }

  /**
   * 记录错误日志
   * @param error TempuraiError实例
   * @param additionalContext 额外上下文信息
   */
  public logError(error: TempuraiError, additionalContext?: any): void {
    const logLevel = this.getLogLevel(error.severity);
    const message = `Error [${error.code}]: ${error.message}`;
    
    const logContext = {
      errorCode: error.code,
      severity: error.severity,
      recoveryStrategy: error.recoveryStrategy,
      context: error.context,
      timestamp: error.timestamp.toISOString(),
      ...(additionalContext && { additionalContext }),
      ...(this.config.logStackTrace && error.stack && { stack: error.stack }),
      ...(error.cause && { cause: error.cause.message })
    };

    switch (logLevel) {
      case LogLevel.DEBUG:
        this.logger.debug(message, logContext);
        break;
      case LogLevel.INFO:
        this.logger.info(message, logContext);
        break;
      case LogLevel.WARN:
        this.logger.warn(message, logContext);
        break;
      case LogLevel.ERROR:
        this.logger.error(message, logContext);
        break;
      case LogLevel.FATAL:
        this.logger.fatal(message, logContext);
        break;
    }

    // 如果开启详细模式，额外输出到控制台
    if (this.config.verbose && !(this.logger instanceof ConsoleLogger)) {
      console.error(`[${error.severity.toUpperCase()}] ${error.toString()}`);
      if (this.config.logStackTrace && error.stack) {
        console.error(error.stack);
      }
    }
  }

  /**
   * 获取错误统计信息
   * @param timeRangeMs 时间范围（毫秒）
   * @returns 错误统计信息
   */
  public getErrorStatistics(timeRangeMs?: number) {
    if (!this.config.enableStatistics) {
      throw new Error('Error statistics is not enabled');
    }
    
    return this.statisticsCollector.getStatistics(timeRangeMs);
  }

  /**
   * 检查是否存在严重错误
   * @param timeRangeMs 时间范围（毫秒）
   * @returns 是否存在严重错误
   */
  public hasCriticalErrors(timeRangeMs?: number): boolean {
    if (!this.config.enableStatistics) {
      return false;
    }
    
    return this.statisticsCollector.hasCriticalErrors(timeRangeMs);
  }

  /**
   * 清除错误统计历史
   */
  public clearErrorHistory(): void {
    if (this.config.enableStatistics) {
      this.statisticsCollector.clearHistory();
    }
  }

  /**
   * 更新错误处理器配置
   * @param newConfig 新的配置项
   */
  public updateConfig(newConfig: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.logger) {
      this.logger = newConfig.logger;
    }
    
    if (newConfig.errorIdGenerator) {
      this.errorIdGenerator = newConfig.errorIdGenerator;
    }
  }

  /**
   * 格式化技术错误详情
   * @param error TempuraiError实例
   * @returns 技术错误详情字符串
   */
  private formatTechnicalDetails(error: TempuraiError): string {
    const details: string[] = [
      `Error: ${error.name}`,
      `Message: ${error.message}`,
      `Code: ${error.code}`,
      `Severity: ${error.severity}`,
      `Recovery Strategy: ${error.recoveryStrategy}`,
      `Timestamp: ${error.timestamp.toISOString()}`
    ];

    if (error.context.component) {
      details.push(`Component: ${error.context.component}`);
    }

    if (error.context.operation) {
      details.push(`Operation: ${error.context.operation}`);
    }

    if (error.cause) {
      details.push(`Caused by: ${error.cause.message}`);
    }

    return details.join('\n');
  }

  /**
   * 根据错误严重程度获取日志级别
   * @param severity 错误严重程度
   * @returns 日志级别
   */
  private getLogLevel(severity: ErrorSeverity): LogLevel {
    switch (severity) {
      case ErrorSeverity.LOW:
        return LogLevel.WARN;
      case ErrorSeverity.MEDIUM:
        return LogLevel.ERROR;
      case ErrorSeverity.HIGH:
        return LogLevel.ERROR;
      case ErrorSeverity.CRITICAL:
        return LogLevel.FATAL;
      default:
        return LogLevel.ERROR;
    }
  }

  /**
   * 计算重试延迟时间
   * @param error TempuraiError实例
   * @returns 重试延迟时间（毫秒）
   */
  private calculateRetryDelay(error: TempuraiError): number | undefined {
    if (!error.canRetry()) {
      return undefined;
    }

    // 根据错误类型和严重程度计算延迟
    let baseDelay = 1000; // 1秒基础延迟

    switch (error.severity) {
      case ErrorSeverity.LOW:
        baseDelay = 500;
        break;
      case ErrorSeverity.MEDIUM:
        baseDelay = 1000;
        break;
      case ErrorSeverity.HIGH:
        baseDelay = 2000;
        break;
      case ErrorSeverity.CRITICAL:
        baseDelay = 5000;
        break;
    }

    // 根据错误类型调整
    // 根据错误代码确定重试延迟
    if (error.code === ErrorCode.API_RATE_LIMIT) {
      baseDelay = 60000; // API限制需要等待更长时间
    } else if (error.code === ErrorCode.CONNECTION_TIMEOUT) {
      baseDelay = 5000; // 连接超时需要较长等待
    } else if (error.code === ErrorCode.FILE_LOCKED) {
      baseDelay = 2000; // 文件锁定需要等待
    }

    return baseDelay;
  }

  /**
   * 默认错误ID生成器
   * @returns 错误唯一标识符
   */
  private defaultErrorIdGenerator(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 全局错误处理器实例
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * 便捷函数：处理错误
 * @param error 要处理的错误
 * @param context 错误上下文
 * @returns 错误处理响应
 */
export function handleError(error: Error | TempuraiError, context?: ErrorContext): ErrorResponse {
  return globalErrorHandler.handleError(error, context);
}

/**
 * 便捷函数：记录错误日志
 * @param error 要记录的错误
 * @param context 错误上下文
 */
export function logError(error: Error | TempuraiError, context?: any): void {
  const tempuraiError = error instanceof TempuraiError ? 
    error : 
    convertToTempuraiError(error);
  
  globalErrorHandler.logError(tempuraiError, context);
}

/**
 * 便捷函数：格式化用户消息
 * @param error 错误实例
 * @returns 用户友好的错误消息
 */
export function formatUserMessage(error: Error | TempuraiError): string {
  const tempuraiError = error instanceof TempuraiError ? 
    error : 
    convertToTempuraiError(error);
  
  return globalErrorHandler.formatUserMessage(tempuraiError);
}