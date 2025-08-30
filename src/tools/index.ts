/**
 * 统一工具接口定义
 */
interface ToolExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime: number;
    toolName: string;
    timestamp: string;
  };
}

interface BaseTool {
  id: string;
  name: string;
  description: string;
  parameters: any; // zod schema
  execute: (params: any) => Promise<ToolExecutionResult>;
}

// 导出现有工具
export * from './ShellExecutor.js';
export * from '../services/SnapshotManager.js';

// 核心工具(非冲突导出)
export { projectContextTool, codeSearchTool } from './CoreTools.js';
export { readFileTool as coreReadFileTool, writeFileTool as coreWriteFileTool } from './CoreTools.js';

// 传统工具(最小使用)
export * from './FileTools.js';
export * from './GitTools.js';
export * from './CodeTools.js';

// 错误处理
export * from '../errors/ErrorHandler.js';

// 导出接口定义
export type { ToolExecutionResult, BaseTool };