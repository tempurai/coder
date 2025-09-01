import { SnapshotResult, RestoreResult, SnapshotInfo } from '../services/SnapshotManager.js';

/**
 * 快照管理器接口定义
 * 提供项目状态快照和恢复功能
 */
export interface ISnapshotManager {
  /**
   * 初始化快照管理器
   */
  initialize(): Promise<void>;

  /**
   * 创建项目状态快照
   * @param description 快照描述
   * @returns 快照创建结果
   */
  createSnapshot(description: string): Promise<SnapshotResult>;

  /**
   * 恢复到指定快照
   * @param snapshotId 快照ID
   * @returns 恢复结果
   */
  restoreSnapshot(snapshotId: string): Promise<RestoreResult>;

  /**
   * 列出所有快照
   * @returns 快照信息列表
   */
  listSnapshots(): Promise<SnapshotInfo[]>;

  /**
   * 清理旧快照
   * @param retentionDays 保留天数
   * @returns 清理的快照数量
   */
  cleanupOldSnapshots(retentionDays?: number): Promise<number>;

  /**
   * 获取快照管理器状态
   * @returns 状态信息
   */
  getStatus(): Promise<{
    initialized: boolean;
    shadowRepoExists: boolean;
    snapshotCount: number;
    latestSnapshot?: SnapshotInfo;
  }>;
}

/**
 * 快照管理器工厂函数类型
 */
export type ISnapshotManagerFactory = (projectRoot?: string) => Promise<ISnapshotManager>;