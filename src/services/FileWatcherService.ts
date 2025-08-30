import * as fs from 'fs';
import * as path from 'path';
import { injectable } from 'inversify';

/**
 * 文件变更事件接口
 */
interface FileChangeEvent {
  filePath: string;
  timestamp: Date;
  eventType: 'change' | 'rename';
  size?: number;
  modifiedTime?: Date;
}

/**
 * 批量文件变更信息接口
 */
export interface BatchedFileChanges {
  /** 变更的文件列表 */
  changedFiles: string[];
  /** 变更事件详情 */
  events: FileChangeEvent[];
  /** 批次开始时间 */
  batchStartTime: Date;
  /** 批次结束时间 */
  batchEndTime: Date;
  /** 总变更次数 */
  totalChanges: number;
  /** 去重后的变更次数 */
  uniqueChanges: number;
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
  /** 批量处理窗口大小（毫秒） */
  batchWindowMs?: number;
  /** 自动清理未使用监听器的间隔（毫秒） */
  cleanupIntervalMs?: number;
  /** 未访问监听器的超时时间（毫秒） */
  unusedTimeoutMs?: number;
}

/**
 * 文件监听服务
 * 
 * 监听指定文件的变更，并提供变更文件列表的查询功能。
 * 使用防抖机制避免频繁的文件系统事件，并限制最大监听文件数量以保护系统资源。
 */
@injectable()
export class FileWatcherService {
  private readonly watchedFiles = new Set<string>();
  private readonly fileWatchers = new Map<string, fs.FSWatcher>();
  private readonly changedFiles = new Set<string>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly options: Required<FileWatcherOptions>;
  private readonly changeEvents: FileChangeEvent[] = [];
  private readonly batchedEvents: Map<string, FileChangeEvent[]> = new Map();
  private readonly lastAccessTime = new Map<string, Date>();
  private readonly batchTimer = new Map<string, NodeJS.Timeout>();
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * 构造函数
   * 
   * @param options 配置选项
   */
  constructor(options: FileWatcherOptions = {}) {
    this.options = {
      verbose: options.verbose ?? false,
      debounceMs: options.debounceMs ?? 300, // 300ms防抖
      maxWatchedFiles: options.maxWatchedFiles ?? 100, // 最多监听100个文件
      batchWindowMs: options.batchWindowMs ?? 1000, // 1秒批量窗口
      cleanupIntervalMs: options.cleanupIntervalMs ?? 60000, // 1分钟清理间隔
      unusedTimeoutMs: options.unusedTimeoutMs ?? 300000 // 5分钟未使用超时
    };

    // 进程退出时清理所有监听器
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());

    // 启动自动清理定时器
    this.startCleanupTimer();
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
   * 获取批量文件变更信息
   * @param clearAfterGet 获取后是否清空记录
   * @returns 批量变更信息
   */
  public getBatchedChanges(clearAfterGet: boolean = true): BatchedFileChanges {
    // 先处理所有待处理的批量事件
    for (const [filePath, timer] of this.batchTimer) {
      clearTimeout(timer);
      this.flushBatchForFile(filePath);
    }
    this.batchTimer.clear();

    const changedFiles = Array.from(this.changedFiles);
    const events = [...this.changeEvents];
    
    // 计算统计信息
    const batchStartTime = events.length > 0 ? 
      new Date(Math.min(...events.map(e => e.timestamp.getTime()))) : 
      new Date();
    const batchEndTime = events.length > 0 ? 
      new Date(Math.max(...events.map(e => e.timestamp.getTime()))) : 
      new Date();
    
    const result: BatchedFileChanges = {
      changedFiles,
      events,
      batchStartTime,
      batchEndTime,
      totalChanges: events.length,
      uniqueChanges: changedFiles.length
    };

    if (clearAfterGet) {
      this.changedFiles.clear();
      this.changeEvents.length = 0;
      this.batchedEvents.clear();
    }

    if (this.options.verbose && changedFiles.length > 0) {
      console.log(`📁 批量获取 ${changedFiles.length} 个变更文件, ${events.length} 个事件`);
    }

    return result;
  }

  /**
   * 优化监听列表：移除长时间未访问的文件监听
   */
  public optimizeWatchList(): void {
    const now = new Date();
    const toUnwatch: string[] = [];
    
    for (const [filePath, lastAccess] of this.lastAccessTime) {
      const timeSinceAccess = now.getTime() - lastAccess.getTime();
      
      if (timeSinceAccess > this.options.unusedTimeoutMs) {
        // 检查文件是否仍然存在
        if (!fs.existsSync(filePath)) {
          toUnwatch.push(filePath);
        } else {
          // 文件存在但长时间未变更，考虑是否需要继续监听
          toUnwatch.push(filePath);
        }
      }
    }

    // 移除长时间未使用的监听器
    for (const filePath of toUnwatch) {
      this.unwatchFile(filePath);
      this.lastAccessTime.delete(filePath);
    }

    if (this.options.verbose && toUnwatch.length > 0) {
      console.log(`📁 优化监听列表，移除 ${toUnwatch.length} 个未使用的文件监听`);
    }
  }

  /**
   * 处理文件变更事件（优化版本：300ms内的变更事件去重合并）
   * @param filePath 文件路径
   * @param eventType 事件类型
   */
  private handleFileChange(filePath: string, eventType: string): void {
    // 更新访问时间
    this.lastAccessTime.set(filePath, new Date());
    
    // 清除之前的防抖定时器
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // 获取文件信息
    let fileSize: number | undefined;
    let modifiedTime: Date | undefined;
    try {
      const stats = fs.statSync(filePath);
      fileSize = stats.size;
      modifiedTime = stats.mtime;
    } catch {
      // 忽略文件信息获取失败
    }
    
    // 创建事件对象
    const event: FileChangeEvent = {
      filePath,
      timestamp: new Date(),
      eventType: eventType as 'change' | 'rename',
      size: fileSize,
      modifiedTime
    };
    
    // 添加到批量事件中
    if (!this.batchedEvents.has(filePath)) {
      this.batchedEvents.set(filePath, []);
    }
    this.batchedEvents.get(filePath)!.push(event);
    
    // 设置新的防抖定时器（300ms内的事件去重）
    const timer = setTimeout(() => {
      this.processBatchedFileChanges(filePath);
      this.debounceTimers.delete(filePath);
    }, this.options.debounceMs);
    
    this.debounceTimers.set(filePath, timer);
    
    // 设置批量处理定时器
    if (!this.batchTimer.has(filePath)) {
      const batchTimer = setTimeout(() => {
        this.flushBatchForFile(filePath);
        this.batchTimer.delete(filePath);
      }, this.options.batchWindowMs);
      this.batchTimer.set(filePath, batchTimer);
    }
  }

  /**
   * 处理批量文件变更事件
   * @param filePath 文件路径
   */
  private processBatchedFileChanges(filePath: string): void {
    const events = this.batchedEvents.get(filePath);
    if (!events || events.length === 0) {
      return;
    }

    try {
      // 去重处理：合并相同文件的多个事件
      const uniqueEvents = this.deduplicateEvents(events);
      
      // 检查文件是否仍然存在
      if (!fs.existsSync(filePath)) {
        // 文件被删除，停止监听
        this.unwatchFile(filePath);
        return;
      }

      // 记录变更
      this.changedFiles.add(filePath);
      this.changeEvents.push(...uniqueEvents);

      if (this.options.verbose) {
        console.log(`📁 批量处理文件变更: ${filePath} (${uniqueEvents.length} 个事件)`);
      }

    } catch (error) {
      console.error(`📁 处理批量文件变更错误 (${filePath}):`, error instanceof Error ? error.message : '未知错误');
    } finally {
      // 清理批量事件
      this.batchedEvents.delete(filePath);
    }
  }

  /**
   * 去重事件：合并300ms内的相似事件
   * @param events 事件列表
   * @returns 去重后的事件列表
   */
  private deduplicateEvents(events: FileChangeEvent[]): FileChangeEvent[] {
    if (events.length <= 1) {
      return events;
    }

    const uniqueEvents: FileChangeEvent[] = [];
    const eventMap = new Map<string, FileChangeEvent>();

    // 按时间戳排序
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    for (const event of events) {
      const key = `${event.eventType}_${event.size || 0}`;
      const existing = eventMap.get(key);
      
      if (!existing || 
          (event.timestamp.getTime() - existing.timestamp.getTime()) > this.options.debounceMs) {
        // 新的唯一事件或时间间隔超过防抖时间
        eventMap.set(key, event);
        uniqueEvents.push(event);
      } else {
        // 更新现有事件的时间戳为最新
        existing.timestamp = event.timestamp;
        if (event.size !== undefined) existing.size = event.size;
        if (event.modifiedTime !== undefined) existing.modifiedTime = event.modifiedTime;
      }
    }

    return uniqueEvents;
  }

  /**
   * 刷新指定文件的批处理
   * @param filePath 文件路径
   */
  private flushBatchForFile(filePath: string): void {
    const events = this.batchedEvents.get(filePath);
    if (events && events.length > 0) {
      this.processBatchedFileChanges(filePath);
    }
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

    // 清除所有批量处理定时器
    for (const timer of this.batchTimer.values()) {
      clearTimeout(timer);
    }
    this.batchTimer.clear();

    // 清除自动清理定时器
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // 关闭所有文件监听器
    for (const watcher of this.fileWatchers.values()) {
      watcher.close();
    }
    this.fileWatchers.clear();

    // 清空所有集合和映射
    this.watchedFiles.clear();
    this.changedFiles.clear();
    this.changeEvents.length = 0;
    this.batchedEvents.clear();
    this.lastAccessTime.clear();

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

  /**
   * 启动自动清理定时器
   */
  private startCleanupTimer(): void {
    // 清理现有定时器
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // 启动新的清理定时器
    this.cleanupInterval = setInterval(() => {
      this.optimizeWatchList();
    }, this.options.cleanupIntervalMs);

    if (this.options.verbose) {
      console.log(`📁 自动清理定时器已启动，间隔: ${this.options.cleanupIntervalMs}ms`);
    }
  }
}