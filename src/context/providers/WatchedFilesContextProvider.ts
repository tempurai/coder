import * as fs from 'fs';
import * as path from 'path';
import { BaseContextProvider, ContextPriority } from '../ContextProvider';
import { FileWatcherService } from '../../services/FileWatcherService';

/**
 * 监听文件上下文提供者
 * 
 * 检测并提供自上次对话以来用户在后台修改的文件内容。
 * 这让Agent能够主动感知到对话外的文件变更，实现真正的动态环境感知。
 */
export class WatchedFilesContextProvider extends BaseContextProvider {
  private readonly fileWatcherService: FileWatcherService;

  /**
   * 构造函数
   * 
   * @param fileWatcherService 文件监听服务实例
   */
  constructor(fileWatcherService: FileWatcherService) {
    super(
      'watched-files',
      '提供后台变更文件的内容，让Agent感知环境变化',
      ContextPriority.HIGH, // 高优先级，确保变更信息及时传达
      15000 // 15k字符限制，允许多个文件的变更内容
    );
    this.fileWatcherService = fileWatcherService;
  }

  /**
   * 获取已变更文件的上下文信息
   */
  async getContext(): Promise<string | null> {
    try {
      // 获取变更的文件列表
      const changedFiles = this.fileWatcherService.getChangedFilesAndClear();

      // 如果没有变更文件，返回null
      if (changedFiles.length === 0) {
        return null;
      }

      const fileContents: string[] = [];
      const successfullyReadFiles: string[] = [];

      // 读取每个变更文件的内容
      for (const filePath of changedFiles) {
        try {
          const content = await this.readFileContent(filePath);
          if (content !== null) {
            fileContents.push(content);
            successfullyReadFiles.push(filePath);
          }
        } catch (error) {
          // 单个文件读取失败不影响其他文件
          const errorContent = `--- File: ${filePath} ---\n❌ 读取变更文件失败: ${error instanceof Error ? error.message : '未知错误'}`;
          fileContents.push(errorContent);
        }
      }

      // 如果没有成功读取任何文件，返回null
      if (fileContents.length === 0) {
        return null;
      }

      // 构建上下文信息
      const alertMessage = this.buildAlertMessage(successfullyReadFiles);
      const context = `${alertMessage}\n\n${fileContents.join('\n\n')}`;

      return this.truncateContext(context);

    } catch (error) {
      console.error('🔍 监听文件上下文提供者错误:', error instanceof Error ? error.message : '未知错误');
      return null;
    }
  }

  /**
   * 检查提供者是否启用
   * 只有当有文件变更时才启用
   */
  async isEnabled(): Promise<boolean> {
    try {
      const stats = this.fileWatcherService.getStats();
      return stats.changedFilesCount > 0;
    } catch {
      return false;
    }
  }

  /**
   * 读取单个文件的内容
   */
  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return `--- File: ${filePath} ---\n❌ 文件已被删除或移动`;
      }

      // 检查是否是文件
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return `--- File: ${filePath} ---\n❌ 路径不是文件`;
      }

      // 检查文件大小（限制单个文件不超过3MB）
      const maxFileSize = 3 * 1024 * 1024; // 3MB
      if (stats.size > maxFileSize) {
        return `--- File: ${filePath} ---\n❌ 文件过大 (${Math.round(stats.size / 1024 / 1024)}MB > 3MB)`;
      }

      // 读取文件内容
      const content = fs.readFileSync(filePath, 'utf-8');

      // 格式化文件内容
      const formattedContent = `--- Modified File: ${filePath} ---\n${this.addLineNumbers(content)}\n--- End of ${filePath} ---`;

      return formattedContent;

    } catch (error) {
      throw new Error(`无法读取文件 ${filePath}: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 构建系统提醒消息
   */
  private buildAlertMessage(modifiedFiles: string[]): string {
    const fileList = modifiedFiles.map(file => `\`${file}\``).join(', ');
    
    return `🔔 **SYSTEM ALERT: File Changes Detected**

The user has modified the following ${modifiedFiles.length} file(s) since our last interaction: ${fileList}

These changes happened outside of our conversation. The updated file contents are provided below for your reference.`;
  }

  /**
   * 为文件内容添加行号
   */
  private addLineNumbers(content: string): string {
    const lines = content.split('\n');
    const maxLineNumberWidth = String(lines.length).length;
    
    return lines
      .map((line, index) => {
        const lineNumber = (index + 1).toString().padStart(maxLineNumberWidth, ' ');
        return `${lineNumber}→${line}`;
      })
      .join('\n');
  }

  /**
   * 获取监听服务的统计信息（用于调试）
   */
  public getWatcherStats(): {
    watchedFilesCount: number;
    changedFilesCount: number;
    pendingTimersCount: number;
  } {
    return this.fileWatcherService.getStats();
  }

  /**
   * 获取当前监听的文件列表
   */
  public getWatchedFiles(): string[] {
    return this.fileWatcherService.getWatchedFiles();
  }

  /**
   * 手动添加文件到监听列表
   * 
   * @param filePath 要监听的文件路径
   * @returns 是否成功添加
   */
  public addFileToWatch(filePath: string): boolean {
    return this.fileWatcherService.watchFile(filePath);
  }

  /**
   * 停止监听特定文件
   * 
   * @param filePath 要停止监听的文件路径
   */
  public stopWatchingFile(filePath: string): void {
    this.fileWatcherService.unwatchFile(filePath);
  }

  /**
   * 检查特定文件是否正在被监听
   * 
   * @param filePath 要检查的文件路径
   */
  public isWatchingFile(filePath: string): boolean {
    return this.fileWatcherService.isWatching(filePath);
  }
}