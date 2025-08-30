/**
 * 统一错误处理系统
 */

import { ToolExecutionResult } from '../tools/index.js';

/**
 * 标准化错误响应接口
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  recoveryHint?: string;
}

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  // 工具执行错误
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_PARAMETER_INVALID = 'TOOL_PARAMETER_INVALID',

  // Agent错误
  AGENT_NOT_INITIALIZED = 'AGENT_NOT_INITIALIZED',
  AGENT_INITIALIZATION_FAILED = 'AGENT_INITIALIZATION_FAILED',

  // 配置错误
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  CONFIG_LOADING_FAILED = 'CONFIG_LOADING_FAILED',

  // 安全错误
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  COMMAND_BLOCKED = 'COMMAND_BLOCKED',

  // 解析错误
  XML_PARSING_FAILED = 'XML_PARSING_FAILED',
  JSON_PARSING_FAILED = 'JSON_PARSING_FAILED',

  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // 文件系统错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED = 'FILE_ACCESS_DENIED',

  // 一般错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

/**
 * 统一错误处理器
 */
export class ErrorHandler {

  /**
   * 标准化错误对象
   * @param error 原始错误
   * @param code 错误代码
   * @param recoveryHint 恢复提示
   * @returns 标准化的错误响应
   */
  static standardize(error: unknown, code?: string, recoveryHint?: string): ErrorResponse {
    let errorMessage: string;
    let errorCode = code;

    if (error instanceof Error) {
      errorMessage = error.message;

      // 根据错误类型推断错误代码
      if (!errorCode) {
        errorCode = this.inferErrorCode(error);
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorCode = errorCode || ErrorCode.UNKNOWN_ERROR;
    } else {
      errorMessage = 'An unknown error occurred';
      errorCode = ErrorCode.UNKNOWN_ERROR;
    }

    return {
      success: false,
      error: errorMessage,
      code: errorCode,
      recoveryHint: recoveryHint || this.getRecoveryHint(errorCode)
    };
  }

  /**
   * 包装工具执行，提供统一的错误处理
   * @param fn 要执行的函数
   * @param toolName 工具名称
   * @returns 包装后的执行结果
   */
  static async wrapToolExecution<T>(
    fn: () => Promise<T>,
    toolName: string = 'unknown'
  ): Promise<ToolExecutionResult<T>> {
    const startTime = Date.now();

    try {
      const result = await fn();
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: result,
        metadata: {
          executionTime,
          toolName,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const standardizedError = this.standardize(error, ErrorCode.TOOL_EXECUTION_FAILED);

      return {
        success: false,
        error: standardizedError.error,
        metadata: {
          executionTime,
          toolName,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * 从错误对象推断错误代码
   * @param error 错误对象
   * @returns 错误代码
   */
  private static inferErrorCode(error: Error): string {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // 网络相关错误
    if (message.includes('timeout') || name.includes('timeout')) {
      return ErrorCode.TIMEOUT_ERROR;
    }

    if (message.includes('network') || message.includes('fetch') || name.includes('network')) {
      return ErrorCode.NETWORK_ERROR;
    }

    // 文件系统错误
    if (message.includes('no such file') || message.includes('not found')) {
      return ErrorCode.FILE_NOT_FOUND;
    }

    if (message.includes('permission denied') || message.includes('access denied')) {
      return ErrorCode.FILE_ACCESS_DENIED;
    }

    // 解析错误
    if (message.includes('xml') || message.includes('parsing')) {
      return ErrorCode.XML_PARSING_FAILED;
    }

    if (message.includes('json') || name.includes('syntaxerror')) {
      return ErrorCode.JSON_PARSING_FAILED;
    }

    // 验证错误
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCode.VALIDATION_ERROR;
    }

    // 安全错误
    if (message.includes('security') || message.includes('blocked') || message.includes('denied')) {
      return ErrorCode.SECURITY_VIOLATION;
    }

    return ErrorCode.UNKNOWN_ERROR;
  }

  /**
   * 根据错误代码获取恢复提示
   * @param code 错误代码
   * @returns 恢复提示
   */
  private static getRecoveryHint(code?: string): string {
    switch (code) {
      case ErrorCode.TOOL_NOT_FOUND:
        return 'Check if the tool is properly registered and available';

      case ErrorCode.TOOL_PARAMETER_INVALID:
        return 'Verify the tool parameters match the expected schema';

      case ErrorCode.AGENT_NOT_INITIALIZED:
        return 'Call initializeAsync() before using the agent';

      case ErrorCode.CONFIG_VALIDATION_FAILED:
        return 'Check your configuration file for syntax errors or missing required fields';

      case ErrorCode.SECURITY_VIOLATION:
        return 'Review security settings and ensure the operation is allowed';

      case ErrorCode.XML_PARSING_FAILED:
        return 'Check XML format and ensure all tags are properly closed';

      case ErrorCode.FILE_NOT_FOUND:
        return 'Verify the file path exists and is accessible';

      case ErrorCode.FILE_ACCESS_DENIED:
        return 'Check file permissions and ensure you have necessary access rights';

      case ErrorCode.NETWORK_ERROR:
        return 'Check network connectivity and retry the operation';

      case ErrorCode.TIMEOUT_ERROR:
        return 'The operation took too long. Consider increasing timeout or breaking into smaller tasks';

      default:
        return 'Check the error message for more details and retry if appropriate';
    }
  }

  /**
   * 创建工具执行错误
   * @param toolName 工具名称
   * @param error 原始错误
   * @returns 工具执行结果
   */
  static createToolError<T = any>(toolName: string, error: unknown): ToolExecutionResult<T> {
    const standardizedError = this.standardize(error, ErrorCode.TOOL_EXECUTION_FAILED);

    return {
      success: false,
      error: standardizedError.error,
      metadata: {
        executionTime: 0,
        toolName,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 创建参数验证错误
   * @param toolName 工具名称
   * @param parameterName 参数名称
   * @param expectedType 期望类型
   * @returns 工具执行结果
   */
  static createParameterError<T = any>(
    toolName: string,
    parameterName: string,
    expectedType: string
  ): ToolExecutionResult<T> {
    return {
      success: false,
      error: `Invalid parameter '${parameterName}': expected ${expectedType}`,
      metadata: {
        executionTime: 0,
        toolName,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 日志错误（可选的中央错误记录）
   * @param error 错误信息
   * @param context 上下文信息
   */
  static logError(error: ErrorResponse | unknown, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const errorData = typeof error === 'object' && error !== null && 'success' in error
      ? error
      : this.standardize(error);

    console.error(`[${timestamp}] Error:`, {
      ...errorData,
      context: context || {}
    });
  }
}