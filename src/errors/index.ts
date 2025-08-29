/**
 * Temurai Error System - Simplified
 * 
 * 统一的错误处理系统，使用单一的TempuraiError类型
 */

// 导出基础错误类和枚举
export { 
  TempuraiError,
  ErrorCode,
  ErrorSeverity,
  RecoveryStrategy,
  type ErrorContext
} from './TempuraiError';

// 导出错误处理器
export { 
  ErrorHandler,
  globalErrorHandler,
  handleError,
  logError,
  formatUserMessage,
  type ErrorResponse,
  type Logger,
  type ErrorHandlerConfig,
  LogLevel
} from './ErrorHandler';

// 简化的类型守卫
export function isTempuraiError(error: Error): error is TempuraiError {
  return error instanceof TempuraiError;
}

/**
 * 统一的错误消息格式化函数
 * @param error 错误对象
 * @returns 格式化的错误消息
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof TempuraiError) {
    return error.userMessage;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}

/**
 * 从普通Error转换为TempuraiError
 * @param error 原始错误
 * @param context 错误上下文
 * @returns 转换后的TempuraiError
 */
export function convertToTempuraiError(
  error: Error, 
  context: ErrorContext = {}
): TempuraiError {
  // 如果已经是TempuraiError，直接返回
  if (error instanceof TempuraiError) {
    return error;
  }

  // 根据错误消息推断错误类型和代码
  let errorCode = ErrorCode.UNKNOWN_ERROR;
  let severity = ErrorSeverity.MEDIUM;
  let recoveryStrategy = RecoveryStrategy.NONE;

  if (error.message.includes('ENOENT') || error.message.includes('file not found')) {
    errorCode = ErrorCode.FILE_NOT_FOUND;
    severity = ErrorSeverity.LOW;
    recoveryStrategy = RecoveryStrategy.USER_ACTION;
  } else if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
    errorCode = ErrorCode.FILE_ACCESS_DENIED;
    severity = ErrorSeverity.MEDIUM;
    recoveryStrategy = RecoveryStrategy.USER_ACTION;
  } else if (error.message.includes('timeout') || error.name === 'TimeoutError') {
    errorCode = ErrorCode.TIMEOUT_ERROR;
    severity = ErrorSeverity.MEDIUM;
    recoveryStrategy = RecoveryStrategy.RETRY;
  } else if (error.message.includes('network') || error.message.includes('fetch')) {
    errorCode = ErrorCode.NETWORK_ERROR;
    severity = ErrorSeverity.MEDIUM;
    recoveryStrategy = RecoveryStrategy.RETRY;
  } else if (error.message.includes('config') || error.message.includes('configuration')) {
    errorCode = ErrorCode.CONFIG_VALIDATION_ERROR;
    severity = ErrorSeverity.HIGH;
    recoveryStrategy = RecoveryStrategy.USER_ACTION;
  }

  return TempuraiError.fromError(error, errorCode, context);
}