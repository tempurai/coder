import * as fs from 'fs';
import * as path from 'path';

/**
 * 文件变更事件接口
 */
interface FileChangeEvent {
  filePath: string;
  timestamp: Date;
  eventType: 'change' | 'rename';
}

/**
 * 文件监听器配置选项
 */
interface FileWatcherOptions {
  /** 是否启用详细日志 */
  verbose?: boolean;
  /** 防抖延迟（毫秒），防止频繁的文件变更事件 */
  debounceMs?: number;
  /** 最大监听文件数量，防止资源耗尽 */
  maxWatchedFiles?: number;
}

/**
 * 文件监听服务
 * 
 * 监听指定文件的变更，并提供变更文件列表的查询功能。
 * 使用防抖机制避免频繁的文件系统事件，并限制最大监听文件数量以保护系统资源。
 */
export class FileWatcherService {
  private readonly watchedFiles = new Set<string>();
  private readonly fileWatchers = new Map<string, fs.FSWatcher>();
  private readonly changedFiles = new Set<string>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly options: Required<FileWatcherOptions>;
  private readonly changeEvents: FileChangeEvent[] = [];

  /**
   * 构造函数
   * 
   * @param options 配置选项
   */
  constructor(options: FileWatcherOptions = {}) {
    this.options = {
      verbose: options.verbose ?? false,
      debounceMs: options.debounceMs ?? 300, // 300ms防抖
      maxWatchedFiles: options.maxWatchedFiles ?? 100 // 最多监听100个文件
    };

    // 进程退出时清理所有监听器
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  /**
   * 开始监听文件变更
   * 
   * @param filePath 要监听的文件路径
   * @returns boolean 是否成功开始监听
   */
  public watchFile(filePath: string): boolean {
    try {
      // 解析为绝对路径
      const absolutePath = path.resolve(filePath);

      // 如果已经在监听，直接返回成功
      if (this.watchedFiles.has(absolutePath)) {
        if (this.options.verbose) {
          console.log(`📁 文件已在监听: ${filePath}`);
        }
        return true;
      }

      // 检查监听文件数量限制
      if (this.watchedFiles.size >= this.options.maxWatchedFiles) {
        console.warn(`⚠️ 已达到最大监听文件数量限制 (${this.options.maxWatchedFiles})，无法监听: ${filePath}`);
        return false;
      }

      // 检查文件是否存在
      if (!fs.existsSync(absolutePath)) {
        if (this.options.verbose) {
          console.log(`📁 文件不存在，无法监听: ${filePath}`);
        }
        return false;
      }

      // 检查是否为文件（非目录）
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) {
        if (this.options.verbose) {
          console.log(`📁 路径不是文件，无法监听: ${filePath}`);
        }
        return false;
      }

      // 创建文件监听器
      const watcher = fs.watch(absolutePath, (eventType, filename) => {
        this.handleFileChange(absolutePath, eventType);
      });

      // 处理监听器错误
      watcher.on('error', (error) => {
        console.error(`📁 文件监听器错误 (${filePath}):`, error.message);
        this.unwatchFile(absolutePath);
      });

      // 记录监听状态
      this.watchedFiles.add(absolutePath);
      this.fileWatchers.set(absolutePath, watcher);

      if (this.options.verbose) {
        console.log(`📁 开始监听文件: ${filePath}`);
      }

      return true;

    } catch (error) {
      console.error(`📁 监听文件失败 (${filePath}):`, error instanceof Error ? error.message : '未知错误');
      return false;
    }
  }

  /**
   * 停止监听文件
   * 
   * @param filePath 要停止监听的文件路径
   */
  public unwatchFile(filePath: string): void {
    const absolutePath = path.resolve(filePath);

    // 清理防抖定时器
    const timer = this.debounceTimers.get(absolutePath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(absolutePath);
    }

    // 关闭文件监听器
    const watcher = this.fileWatchers.get(absolutePath);
    if (watcher) {
      watcher.close();
      this.fileWatchers.delete(absolutePath);
    }

    // 从集合中移除
    this.watchedFiles.delete(absolutePath);

    if (this.options.verbose) {
      console.log(`📁 停止监听文件: ${filePath}`);
    }
  }

  /**
   * 获取已变更的文件列表并清空记录
   * 
   * @returns string[] 变更文件路径列表
   */
  public getChangedFilesAndClear(): string[] {
    const changedFilesArray = Array.from(this.changedFiles);
    this.changedFiles.clear();
    
    // 同时清空变更事件记录
    this.changeEvents.length = 0;

    if (this.options.verbose && changedFilesArray.length > 0) {
      console.log(`📁 获取到 ${changedFilesArray.length} 个变更文件:`, changedFilesArray);
    }

    return changedFilesArray;
  }

  /**
   * 处理文件变更事件（带防抖）
   */
  private handleFileChange(filePath: string, eventType: string): void {
    // 清除之前的防抖定时器
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的防抖定时器
    const timer = setTimeout(() => {
      this.processFileChange(filePath, eventType as 'change' | 'rename');
      this.debounceTimers.delete(filePath);
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * 处理实际的文件变更
   */
  private processFileChange(filePath: string, eventType: 'change' | 'rename'): void {
    try {
      // 检查文件是否仍然存在
      if (!fs.existsSync(filePath)) {
        // 文件被删除，停止监听
        this.unwatchFile(filePath);
        return;
      }

      // 记录变更
      this.changedFiles.add(filePath);
      this.changeEvents.push({
        filePath,
        timestamp: new Date(),
        eventType
      });

      if (this.options.verbose) {
        console.log(`📁 文件变更: ${filePath} (${eventType})`);
      }

    } catch (error) {
      console.error(`📁 处理文件变更错误 (${filePath}):`, error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 获取当前监听的文件列表
   */
  public getWatchedFiles(): string[] {
    return Array.from(this.watchedFiles);
  }

  /**
   * 获取监听统计信息
   */
  public getStats(): {
    watchedFilesCount: number;
    changedFilesCount: number;
    pendingTimersCount: number;
  } {
    return {
      watchedFilesCount: this.watchedFiles.size,
      changedFilesCount: this.changedFiles.size,
      pendingTimersCount: this.debounceTimers.size
    };
  }

  /**
   * 清理所有监听器和定时器
   */
  public cleanup(): void {
    if (this.options.verbose) {
      console.log('📁 清理文件监听服务...');
    }

    // 清除所有防抖定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // 关闭所有文件监听器
    for (const watcher of this.fileWatchers.values()) {
      watcher.close();
    }
    this.fileWatchers.clear();

    // 清空集合
    this.watchedFiles.clear();
    this.changedFiles.clear();
    this.changeEvents.length = 0;

    if (this.options.verbose) {
      console.log('📁 文件监听服务清理完成');
    }
  }

  /**
   * 检查特定文件是否正在被监听
   */
  public isWatching(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);
    return this.watchedFiles.has(absolutePath);
  }

  /**
   * 获取最近的文件变更事件（用于调试）
   */
  public getRecentChangeEvents(limit: number = 10): FileChangeEvent[] {
    return this.changeEvents.slice(-limit);
  }
}