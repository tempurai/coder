/**
 * 简化的检查点管理器
 * 提供文件备份和恢复功能
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CheckpointInfo {
  id: string;
  description: string;
  files: string[];
  timestamp: Date;
  backupPath: string;
}

export interface CheckpointCreateOptions {
  description: string;
  files: string[];
}

export interface CheckpointRestoreOptions {
  checkpointId: string;
  files?: string[]; // 如果未指定，恢复所有文件
}

/**
 * 检查点管理器类
 */
export class CheckpointManager {
  private readonly checkpointsDir: string;
  private checkpoints: Map<string, CheckpointInfo> = new Map();

  constructor() {
    this.checkpointsDir = path.join(os.tmpdir(), 'tempurai-checkpoints');
    this.ensureCheckpointsDir();
    this.loadExistingCheckpoints();
  }

  /**
   * 确保检查点目录存在
   */
  private ensureCheckpointsDir(): void {
    if (!fs.existsSync(this.checkpointsDir)) {
      fs.mkdirSync(this.checkpointsDir, { recursive: true });
    }
  }

  /**
   * 加载现有检查点
   */
  private loadExistingCheckpoints(): void {
    try {
      const metaFile = path.join(this.checkpointsDir, 'checkpoints.json');
      if (fs.existsSync(metaFile)) {
        const data = fs.readFileSync(metaFile, 'utf-8');
        const checkpointsArray = JSON.parse(data);
        for (const cp of checkpointsArray) {
          this.checkpoints.set(cp.id, {
            ...cp,
            timestamp: new Date(cp.timestamp)
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load existing checkpoints:', error);
    }
  }

  /**
   * 保存检查点元数据
   */
  private saveCheckpointsMeta(): void {
    try {
      const metaFile = path.join(this.checkpointsDir, 'checkpoints.json');
      const checkpointsArray = Array.from(this.checkpoints.values());
      fs.writeFileSync(metaFile, JSON.stringify(checkpointsArray, null, 2));
    } catch (error) {
      console.warn('Failed to save checkpoints metadata:', error);
    }
  }

  /**
   * 创建检查点
   * @param options 检查点选项
   * @returns 检查点信息
   */
  async createCheckpoint(options: CheckpointCreateOptions): Promise<CheckpointInfo> {
    const checkpointId = `checkpoint_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const backupPath = path.join(this.checkpointsDir, checkpointId);
    
    // 创建备份目录
    fs.mkdirSync(backupPath, { recursive: true });

    const checkpointInfo: CheckpointInfo = {
      id: checkpointId,
      description: options.description,
      files: [...options.files],
      timestamp: new Date(),
      backupPath
    };

    // 备份文件
    for (const filePath of options.files) {
      try {
        if (fs.existsSync(filePath)) {
          const relativePath = path.relative(process.cwd(), filePath);
          const backupFilePath = path.join(backupPath, relativePath);
          
          // 确保备份文件的目录存在
          const backupDir = path.dirname(backupFilePath);
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }

          // 复制文件
          fs.copyFileSync(filePath, backupFilePath);
        }
      } catch (error) {
        console.warn(`Failed to backup file ${filePath}:`, error);
      }
    }

    // 保存检查点信息
    this.checkpoints.set(checkpointId, checkpointInfo);
    this.saveCheckpointsMeta();

    return checkpointInfo;
  }

  /**
   * 恢复检查点
   * @param options 恢复选项
   * @returns 恢复结果
   */
  async restoreCheckpoint(options: CheckpointRestoreOptions): Promise<{
    success: boolean;
    restoredFiles: string[];
    errors: string[];
  }> {
    const checkpoint = this.checkpoints.get(options.checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${options.checkpointId} not found`);
    }

    const filesToRestore = options.files || checkpoint.files;
    const restoredFiles: string[] = [];
    const errors: string[] = [];

    for (const filePath of filesToRestore) {
      try {
        const relativePath = path.relative(process.cwd(), filePath);
        const backupFilePath = path.join(checkpoint.backupPath, relativePath);

        if (fs.existsSync(backupFilePath)) {
          // 确保目标目录存在
          const targetDir = path.dirname(filePath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          // 恢复文件
          fs.copyFileSync(backupFilePath, filePath);
          restoredFiles.push(filePath);
        } else {
          errors.push(`Backup not found for file: ${filePath}`);
        }
      } catch (error) {
        errors.push(`Failed to restore ${filePath}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      restoredFiles,
      errors
    };
  }

  /**
   * 列出所有检查点
   * @returns 检查点信息数组
   */
  listCheckpoints(): CheckpointInfo[] {
    return Array.from(this.checkpoints.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * 删除检查点
   * @param checkpointId 检查点ID
   * @returns 是否删除成功
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return false;
    }

    try {
      // 删除备份文件
      if (fs.existsSync(checkpoint.backupPath)) {
        fs.rmSync(checkpoint.backupPath, { recursive: true, force: true });
      }

      // 从内存中删除
      this.checkpoints.delete(checkpointId);
      this.saveCheckpointsMeta();

      return true;
    } catch (error) {
      console.warn(`Failed to delete checkpoint ${checkpointId}:`, error);
      return false;
    }
  }

  /**
   * 清理旧的检查点
   * @param maxAge 最大保留天数
   * @returns 删除的检查点数量
   */
  async cleanupOldCheckpoints(maxAge: number = 7): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const checkpoint of this.checkpoints.values()) {
      if (checkpoint.timestamp < cutoffTime) {
        if (await this.deleteCheckpoint(checkpoint.id)) {
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  /**
   * 获取检查点信息
   * @param checkpointId 检查点ID
   * @returns 检查点信息或undefined
   */
  getCheckpoint(checkpointId: string): CheckpointInfo | undefined {
    return this.checkpoints.get(checkpointId);
  }
}

// 导出全局实例
export const globalCheckpointManager = new CheckpointManager();