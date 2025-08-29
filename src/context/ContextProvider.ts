/**
 * 上下文提供者核心接口
 * 
 * 定义了统一的上下文信息获取契约。所有具体的上下文提供者都必须实现这个接口，
 * 以确保它们能够被 ContextManager 统一管理和调用。
 * 
 * @example
 * ```typescript
 * class FileTreeProvider implements ContextProvider {
 *   async getContext(): Promise<string | null> {
 *     return "Project Structure:\nsrc/\n  components/\n    App.ts";
 *   }
 * }
 * ```
 */
export interface ContextProvider {
  /**
   * 获取该提供者能提供的上下文信息
   * 
   * 此方法是异步的，允许提供者进行文件系统访问、网络请求或其他 I/O 操作
   * 来收集上下文信息。
   * 
   * @returns Promise<string | null> 包含上下文信息的字符串，如果无上下文可用则返回 null
   */
  getContext(): Promise<string | null>;

  /**
   * 获取该提供者的唯一标识符
   * 
   * 用于在日志、错误报告和调试中标识特定的提供者。
   * 应该是一个简短、描述性的字符串。
   * 
   * @returns 提供者的唯一标识符
   */
  getProviderId(): string;

  /**
   * 获取该提供者的描述信息
   * 
   * 用于说明该提供者提供什么类型的上下文信息，便于开发者理解和调试。
   * 
   * @returns 提供者的描述信息
   */
  getDescription(): string;
}

/**
 * 上下文提供者优先级枚举
 * 
 * 定义了不同类型上下文信息的重要性级别，ContextManager 将按照优先级
 * 从高到低的顺序组织上下文信息。
 */
export enum ContextPriority {
  /** 最高优先级 - 核心项目信息（如项目结构、主要配置） */
  CRITICAL = 1,
  
  /** 高优先级 - 重要的开发环境信息（如 Git 状态、活动文件） */
  HIGH = 2,
  
  /** 中等优先级 - 有用的辅助信息（如最近的错误、性能指标） */
  MEDIUM = 3,
  
  /** 低优先级 - 补充信息（如环境变量、系统信息） */
  LOW = 4
}

/**
 * 扩展的上下文提供者接口
 * 
 * 为需要更细粒度控制的高级提供者提供额外的配置选项。
 * 实现此接口的提供者可以指定优先级、启用/禁用状态等。
 */
export interface ExtendedContextProvider extends ContextProvider {
  /**
   * 获取提供者的优先级
   * 
   * @returns 提供者的优先级级别
   */
  getPriority(): ContextPriority;

  /**
   * 检查提供者当前是否启用
   * 
   * 允许提供者根据环境条件动态启用或禁用自身。
   * 例如，Git 提供者只在 Git 仓库中启用。
   * 
   * @returns Promise<boolean> 如果提供者当前启用则返回 true
   */
  isEnabled(): Promise<boolean>;

  /**
   * 获取上下文信息的最大长度限制
   * 
   * 用于控制单个提供者产生的上下文信息长度，防止某个提供者
   * 产生过多信息而影响整体性能。
   * 
   * @returns 最大字符数，0 表示无限制
   */
  getMaxContextLength(): number;
}

/**
 * 上下文提供者的基础实现类
 * 
 * 提供了 ExtendedContextProvider 的默认实现，简化具体提供者的开发。
 * 子类只需要实现 getContext() 方法即可。
 */
export abstract class BaseContextProvider implements ExtendedContextProvider {
  protected readonly providerId: string;
  protected readonly description: string;
  protected readonly priority: ContextPriority;
  protected readonly maxContextLength: number;

  /**
   * 构造函数
   * 
   * @param providerId 提供者唯一标识符
   * @param description 提供者描述信息
   * @param priority 优先级（默认为 MEDIUM）
   * @param maxContextLength 最大上下文长度（默认为 5000 字符）
   */
  constructor(
    providerId: string,
    description: string,
    priority: ContextPriority = ContextPriority.MEDIUM,
    maxContextLength: number = 5000
  ) {
    this.providerId = providerId;
    this.description = description;
    this.priority = priority;
    this.maxContextLength = maxContextLength;
  }

  /**
   * 获取上下文信息（子类必须实现）
   */
  abstract getContext(): Promise<string | null>;

  /**
   * 获取提供者标识符
   */
  getProviderId(): string {
    return this.providerId;
  }

  /**
   * 获取提供者描述
   */
  getDescription(): string {
    return this.description;
  }

  /**
   * 获取提供者优先级
   */
  getPriority(): ContextPriority {
    return this.priority;
  }

  /**
   * 检查提供者是否启用（默认实现总是返回 true）
   * 
   * 子类可以重写此方法来实现动态启用/禁用逻辑
   */
  async isEnabled(): Promise<boolean> {
    return true;
  }

  /**
   * 获取最大上下文长度
   */
  getMaxContextLength(): number {
    return this.maxContextLength;
  }

  /**
   * 截断上下文信息到指定长度
   * 
   * 提供给子类使用的工具方法，确保返回的上下文不超过限制
   * 
   * @param context 原始上下文信息
   * @returns 截断后的上下文信息
   */
  protected truncateContext(context: string): string {
    if (this.maxContextLength === 0 || context.length <= this.maxContextLength) {
      return context;
    }

    const truncated = context.substring(0, this.maxContextLength - 3);
    return `${truncated}...`;
  }
}