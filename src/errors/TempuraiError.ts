/**
 * 错误码枚举
 * 定义系统中所有可能的错误类型编码
 */
export enum ErrorCode {
  // 通用错误 (1000-1099)
  UNKNOWN_ERROR = 1000,
  INTERNAL_ERROR = 1001,
  VALIDATION_ERROR = 1002,
  TIMEOUT_ERROR = 1003,
  PERMISSION_DENIED = 1004,

  // 配置错误 (1100-1199)
  CONFIG_NOT_FOUND = 1100,
  CONFIG_PARSE_ERROR = 1101,
  CONFIG_VALIDATION_ERROR = 1102,
  MODEL_CONFIG_ERROR = 1103,
  API_KEY_ERROR = 1104,
  CONFIG_FILE_CORRUPT = 1105,

  // 工具执行错误 (1200-1299)
  TOOL_NOT_FOUND = 1200,
  TOOL_EXECUTION_ERROR = 1201,
  TOOL_TIMEOUT = 1202,
  TOOL_PARAMETER_ERROR = 1203,
  TOOL_SECURITY_VIOLATION = 1204,
  TOOL_LOOP_DETECTED = 1205,
  SHELL_COMMAND_ERROR = 1206,

  // 网络错误 (1300-1399)
  NETWORK_ERROR = 1300,
  API_REQUEST_FAILED = 1301,
  API_RATE_LIMIT = 1302,
  API_AUTHENTICATION_ERROR = 1303,
  CONNECTION_TIMEOUT = 1304,
  DNS_RESOLUTION_ERROR = 1305,

  // 文件系统错误 (1400-1499)
  FILE_NOT_FOUND = 1400,
  FILE_ACCESS_DENIED = 1401,
  FILE_READ_ERROR = 1402,
  FILE_WRITE_ERROR = 1403,
  DIRECTORY_NOT_FOUND = 1404,
  DISK_FULL = 1405,
  FILE_LOCKED = 1406,

  // MCP 相关错误 (1500-1599)
  MCP_CONNECTION_ERROR = 1500,
  MCP_PROTOCOL_ERROR = 1501,
  MCP_TOOL_LOAD_ERROR = 1502,
  MCP_AUTHENTICATION_ERROR = 1503,
  MCP_TIMEOUT = 1504,
  MCP_INVALID_RESPONSE = 1505
}

/**
 * 错误严重程度级别
 */
export enum ErrorSeverity {
  LOW = 'low',       // 警告级别，不影响核心功能
  MEDIUM = 'medium', // 影响部分功能，但系统可继续运行
  HIGH = 'high',     // 严重错误，影响主要功能
  CRITICAL = 'critical' // 致命错误，系统无法正常运行
}

/**
 * 错误恢复策略类型
 */
export enum RecoveryStrategy {
  NONE = 'none',           // 无法自动恢复，需要用户干预
  RETRY = 'retry',         // 可以重试操作
  FALLBACK = 'fallback',   // 使用备用方案
  RESTART = 'restart',     // 需要重启服务或组件
  USER_ACTION = 'user_action' // 需要用户执行特定操作
}

/**
 * 错误上下文信息接口
 */
export interface ErrorContext {
  /** 发生错误的组件名称 */
  component?: string;
  /** 操作名称或函数名 */
  operation?: string;
  /** 用户ID或会话ID */
  userId?: string;
  /** 时间戳 */
  timestamp?: Date;
  /** 请求ID，用于跟踪 */
  requestId?: string;
  /** 附加的调试信息 */
  metadata?: Record<string, any>;
}

/**
 * TempuraiError 基础错误类
 * 所有系统错误的基类，提供统一的错误处理接口
 */
export class TempuraiError extends Error {
  /** 错误编码 */
  public readonly code: ErrorCode;
  
  /** 错误严重程度 */
  public readonly severity: ErrorSeverity;
  
  /** 恢复策略 */
  public readonly recoveryStrategy: RecoveryStrategy;
  
  /** 错误上下文 */
  public readonly context: ErrorContext;
  
  /** 恢复建议 */
  public readonly recoveryAdvice: string[];
  
  /** 原始错误（如果是包装其他错误） */
  public readonly cause?: Error;
  
  /** 错误发生时间 */
  public readonly timestamp: Date;
  
  /** 用户友好的错误消息 */
  public readonly userMessage: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoveryStrategy: RecoveryStrategy = RecoveryStrategy.NONE,
    context: ErrorContext = {},
    recoveryAdvice: string[] = [],
    cause?: Error
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.code = code;
    this.severity = severity;
    this.recoveryStrategy = recoveryStrategy;
    this.context = { ...context, timestamp: new Date() };
    this.recoveryAdvice = recoveryAdvice;
    this.cause = cause;
    this.timestamp = new Date();
    this.userMessage = this.generateUserMessage();

    // 保持错误堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // 如果有原因错误，将其堆栈添加到当前错误
    if (cause && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }

  /**
   * 生成用户友好的错误消息
   * @returns 用户可理解的错误描述
   */
  private generateUserMessage(): string {
    const errorMessages: Record<ErrorCode, string> = {
      [ErrorCode.UNKNOWN_ERROR]: '发生了未知错误，请稍后重试',
      [ErrorCode.INTERNAL_ERROR]: '系统内部错误，请联系技术支持',
      [ErrorCode.VALIDATION_ERROR]: '输入数据验证失败，请检查输入内容',
      [ErrorCode.TIMEOUT_ERROR]: '操作超时，请稍后重试',
      [ErrorCode.PERMISSION_DENIED]: '权限不足，无法执行该操作',
      
      [ErrorCode.CONFIG_NOT_FOUND]: '配置文件未找到，请检查配置',
      [ErrorCode.CONFIG_PARSE_ERROR]: '配置文件格式错误，请检查语法',
      [ErrorCode.CONFIG_VALIDATION_ERROR]: '配置验证失败，请检查配置项',
      [ErrorCode.MODEL_CONFIG_ERROR]: '模型配置错误，请检查API设置',
      [ErrorCode.API_KEY_ERROR]: 'API密钥无效，请检查密钥配置',
      [ErrorCode.CONFIG_FILE_CORRUPT]: '配置文件已损坏，请重新生成',
      
      [ErrorCode.TOOL_NOT_FOUND]: '工具未找到，请检查工具配置',
      [ErrorCode.TOOL_EXECUTION_ERROR]: '工具执行失败，请查看详细信息',
      [ErrorCode.TOOL_TIMEOUT]: '工具执行超时，请稍后重试',
      [ErrorCode.TOOL_PARAMETER_ERROR]: '工具参数错误，请检查输入参数',
      [ErrorCode.TOOL_SECURITY_VIOLATION]: '操作被安全策略阻止',
      [ErrorCode.TOOL_LOOP_DETECTED]: '检测到重复操作，已自动停止',
      [ErrorCode.SHELL_COMMAND_ERROR]: '命令执行失败，请检查命令语法',
      
      [ErrorCode.NETWORK_ERROR]: '网络连接错误，请检查网络设置',
      [ErrorCode.API_REQUEST_FAILED]: 'API请求失败，请稍后重试',
      [ErrorCode.API_RATE_LIMIT]: 'API调用频率过高，请稍后重试',
      [ErrorCode.API_AUTHENTICATION_ERROR]: 'API认证失败，请检查凭据',
      [ErrorCode.CONNECTION_TIMEOUT]: '连接超时，请检查网络状态',
      [ErrorCode.DNS_RESOLUTION_ERROR]: 'DNS解析失败，请检查网络配置',
      
      [ErrorCode.FILE_NOT_FOUND]: '文件不存在，请检查文件路径',
      [ErrorCode.FILE_ACCESS_DENIED]: '文件访问被拒绝，请检查权限',
      [ErrorCode.FILE_READ_ERROR]: '文件读取失败，请检查文件状态',
      [ErrorCode.FILE_WRITE_ERROR]: '文件写入失败，请检查磁盘空间和权限',
      [ErrorCode.DIRECTORY_NOT_FOUND]: '目录不存在，请检查路径',
      [ErrorCode.DISK_FULL]: '磁盘空间不足，请清理磁盘空间',
      [ErrorCode.FILE_LOCKED]: '文件被锁定，请稍后重试',
      
      [ErrorCode.MCP_CONNECTION_ERROR]: 'MCP连接失败，请检查服务状态',
      [ErrorCode.MCP_PROTOCOL_ERROR]: 'MCP协议错误，请更新工具版本',
      [ErrorCode.MCP_TOOL_LOAD_ERROR]: 'MCP工具加载失败，请检查工具配置',
      [ErrorCode.MCP_AUTHENTICATION_ERROR]: 'MCP认证失败，请检查凭据',
      [ErrorCode.MCP_TIMEOUT]: 'MCP操作超时，请稍后重试',
      [ErrorCode.MCP_INVALID_RESPONSE]: 'MCP响应格式无效，请联系开发者'
    };

    return errorMessages[this.code] || this.message;
  }

  /**
   * 将错误转换为JSON格式
   * @returns JSON表示的错误信息
   */
  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      userMessage: this.userMessage,
      code: this.code,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      context: this.context,
      recoveryAdvice: this.recoveryAdvice,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack
      } : undefined
    };
  }

  /**
   * 获取格式化的错误信息用于日志记录
   * @returns 格式化的错误字符串
   */
  public toString(): string {
    const parts = [
      `[${this.code}] ${this.name}: ${this.message}`,
      `Severity: ${this.severity}`,
      `Recovery: ${this.recoveryStrategy}`
    ];

    if (this.context.component) {
      parts.push(`Component: ${this.context.component}`);
    }

    if (this.context.operation) {
      parts.push(`Operation: ${this.context.operation}`);
    }

    if (this.recoveryAdvice.length > 0) {
      parts.push(`Recovery Advice: ${this.recoveryAdvice.join(', ')}`);
    }

    return parts.join(' | ');
  }

  /**
   * 检查错误是否可以重试
   * @returns 是否可以重试
   */
  public canRetry(): boolean {
    return this.recoveryStrategy === RecoveryStrategy.RETRY;
  }

  /**
   * 检查错误是否有备用方案
   * @returns 是否有备用方案
   */
  public hasFallback(): boolean {
    return this.recoveryStrategy === RecoveryStrategy.FALLBACK;
  }

  /**
   * 检查是否为致命错误
   * @returns 是否为致命错误
   */
  public isCritical(): boolean {
    return this.severity === ErrorSeverity.CRITICAL;
  }

  /**
   * 创建一个基于当前错误的新错误实例
   * @param updates 要更新的属性
   * @returns 新的错误实例
   */
  public clone(updates: Partial<{
    message: string;
    code: ErrorCode;
    severity: ErrorSeverity;
    recoveryStrategy: RecoveryStrategy;
    context: ErrorContext;
    recoveryAdvice: string[];
  }>): TempuraiError {
    return new TempuraiError(
      updates.message || this.message,
      updates.code || this.code,
      updates.severity || this.severity,
      updates.recoveryStrategy || this.recoveryStrategy,
      { ...this.context, ...updates.context },
      updates.recoveryAdvice || this.recoveryAdvice,
      this.cause
    );
  }

  /**
   * 静态方法：从普通Error创建TempuraiError
   * @param error 原始错误
   * @param code 错误编码
   * @param context 错误上下文
   * @returns TempuraiError实例
   */
  public static fromError(
    error: Error, 
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    context: ErrorContext = {}
  ): TempuraiError {
    return new TempuraiError(
      error.message,
      code,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.NONE,
      context,
      [],
      error
    );
  }

  /**
   * 静态方法：创建内部错误
   * @param message 错误消息
   * @param context 错误上下文
   * @returns TempuraiError实例
   */
  public static internal(message: string, context: ErrorContext = {}): TempuraiError {
    return new TempuraiError(
      message,
      ErrorCode.INTERNAL_ERROR,
      ErrorSeverity.HIGH,
      RecoveryStrategy.RESTART,
      context,
      ['重启应用', '检查系统日志', '联系技术支持']
    );
  }

  /**
   * 静态方法：创建验证错误
   * @param message 错误消息
   * @param context 错误上下文
   * @returns TempuraiError实例
   */
  public static validation(message: string, context: ErrorContext = {}): TempuraiError {
    return new TempuraiError(
      message,
      ErrorCode.VALIDATION_ERROR,
      ErrorSeverity.LOW,
      RecoveryStrategy.USER_ACTION,
      context,
      ['检查输入格式', '参考文档示例', '修正输入内容']
    );
  }

  /**
   * 静态方法：创建超时错误
   * @param operation 超时的操作名称
   * @param timeout 超时时间（毫秒）
   * @param context 错误上下文
   * @returns TempuraiError实例
   */
  public static timeout(operation: string, timeout: number, context: ErrorContext = {}): TempuraiError {
    return new TempuraiError(
      `Operation '${operation}' timed out after ${timeout}ms`,
      ErrorCode.TIMEOUT_ERROR,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.RETRY,
      { ...context, operation },
      ['稍后重试', '检查网络连接', '增加超时时间']
    );
  }
}