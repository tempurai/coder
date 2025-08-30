import { TaskExecutionResult } from '../session/SessionService.js';

/**
 * ReAct Agent接口定义
 * 提供基于ReAct模式的任务执行能力
 */
export interface IReActAgent {
  /**
   * 执行任务
   * @param query 任务查询描述
   * @returns 任务执行结果
   */
  runTask(query: string): Promise<TaskExecutionResult>;
}

/**
 * Git工作流任务开始结果
 */
export interface GitTaskStartResult {
  success: boolean;
  taskBranchName?: string;
  error?: string;
}

/**
 * Git工作流任务结束结果
 */
export interface GitTaskEndResult {
  success: boolean;
  filesChanged?: number;
  diffStats?: string;
  fullDiff?: string;
  error?: string;
}

/**
 * Git工作流丢弃任务结果
 */
export interface GitTaskDiscardResult {
  success: boolean;
  error?: string;
}

/**
 * Git工作流状态
 */
export interface GitWorkflowStatus {
  success: boolean;
  isTaskBranch: boolean;
  currentBranch?: string;
  error?: string;
}

/**
 * Git工作流管理器接口定义
 * 提供基于Git分支的任务工作流管理
 */
export interface IGitWorkflowManager {
  /**
   * 开始一个新任务，创建任务分支
   * @param taskDescription 任务描述
   * @returns 任务开始结果
   */
  startTask(taskDescription: string): Promise<GitTaskStartResult>;

  /**
   * 结束当前任务，生成摘要和diff
   * @returns 任务结束结果
   */
  endTask(): Promise<GitTaskEndResult>;

  /**
   * 丢弃当前任务，切换到指定分支
   * @param targetBranch 目标分支名
   * @param force 是否强制丢弃
   * @returns 丢弃结果
   */
  discardTask(targetBranch: string, force: boolean): Promise<GitTaskDiscardResult>;

  /**
   * 获取当前工作流状态
   * @returns 工作流状态
   */
  getWorkflowStatus(): Promise<GitWorkflowStatus>;
}

/**
 * ReAct Agent工厂函数类型
 */
export type IReActAgentFactory = (agent: any) => Promise<IReActAgent>;

/**
 * Git工作流管理器工厂函数类型
 */
export type IGitWorkflowManagerFactory = () => Promise<IGitWorkflowManager>;