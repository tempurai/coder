import type { ErrorResponse } from './ErrorHandler';

/**
 * 便捷的错误格式化函数
 * @param error 错误对象
 * @returns 格式化的错误消息
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * 检查是否为标准错误响应
 * @param response 响应对象
 * @returns 是否为ErrorResponse类型
 */
export function isErrorResponse(response: any): response is ErrorResponse {
  return response && typeof response === 'object' && response.success === false && 'error' in response;
}