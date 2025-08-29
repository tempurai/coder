import { 
  ContextProvider, 
  ExtendedContextProvider, 
  ContextPriority 
} from './ContextProvider';

/**
 * 上下文管理器配置接口
 */
interface ContextManagerConfig {
  /** 是否启用详细日志输出 */
  verbose?: boolean;
  /** 单个上下文提供者的超时时间（毫秒） */
  timeout?: number;
  /** 组合上下文的最大总长度 */
  maxTotalLength?: number;
  /** 是否在上下文信息中包含提供者元数据 */
  includeMetadata?: boolean;
}

/**
 * 单个提供者的执行结果
 */
interface ProviderResult {
  /** 提供者实例 */
  provider: ContextProvider;
  /** 获取到的上下文内容 */
  context: string | null;
  /** 执行时间（毫秒） */
  executionTime: number;
  /** 是否执行成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 组合上下文的执行统计信息
 */
interface ContextStats {
  /** 已注册的提供者总数 */
  totalProviders: number;
  /** 启用的提供者数量 */
  enabledProviders: number;
  /** 成功执行的提供者数量 */
  successfulProviders: number;
  /** 执行总时间（毫秒） */
  totalExecutionTime: number;
  /** 最终上下文字符串长度 */
  finalContextLength: number;
}

/**
 * 上下文管理器
 * 
 * 负责注册、协调和管理所有的上下文提供者。它是上下文系统的核心组件，
 * 提供统一的接口来获取来自多个来源的上下文信息。
 * 
 * @example
 * ```typescript
 * const contextManager = new ContextManager();
 * 
 * // 注册提供者
 * contextManager.registerProvider(new ProjectStructureProvider());
 * contextManager.registerProvider(new GitStatusProvider());
 * 
 * // 获取组合上下文
 * const context = await contextManager.getCombinedContext();
 * ```
 */
export class ContextManager {
  private readonly providers: Map<string, ContextProvider> = new Map();
  private readonly config: Required<ContextManagerConfig>;

  /**
   * 创建上下文管理器实例
   * 
   * @param config 可选的配置参数
   */
  constructor(config: ContextManagerConfig = {}) {
    this.config = {
      verbose: false,
      timeout: 5000, // 5秒超时
      maxTotalLength: 20000, // 20k字符限制
      includeMetadata: true,
      ...config
    };

    if (this.config.verbose) {
      console.log('📋 ContextManager initialized with config:', this.config);
    }
  }

  /**
   * 注册一个上下文提供者
   * 
   * @param provider 要注册的上下文提供者
   * @throws Error 如果提供者ID已存在
   */
  registerProvider(provider: ContextProvider): void {
    const providerId = provider.getProviderId();
    
    if (this.providers.has(providerId)) {
      throw new Error(`Context provider with ID '${providerId}' is already registered`);
    }

    this.providers.set(providerId, provider);
    
    if (this.config.verbose) {
      console.log(`✅ Registered context provider: ${providerId} - ${provider.getDescription()}`);
    }
  }

  /**
   * 注销一个上下文提供者
   * 
   * @param providerId 要注销的提供者ID
   * @returns boolean 如果提供者存在并被成功注销则返回 true
   */
  unregisterProvider(providerId: string): boolean {
    const success = this.providers.delete(providerId);
    
    if (success && this.config.verbose) {
      console.log(`🗑️ Unregistered context provider: ${providerId}`);
    }
    
    return success;
  }

  /**
   * 获取所有已注册的提供者列表
   * 
   * @returns 提供者ID数组
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 检查指定的提供者是否已注册
   * 
   * @param providerId 提供者ID
   * @returns 如果已注册则返回 true
   */
  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * 获取组合的上下文信息
   * 
   * 这是核心方法，它会：
   * 1. 遍历所有已注册的提供者
   * 2. 检查每个提供者是否启用
   * 3. 并发执行所有启用的提供者
   * 4. 按优先级组织返回的上下文信息
   * 5. 生成格式化的组合上下文字符串
   * 
   * @returns Promise<string> 组合后的上下文字符串
   */
  async getCombinedContext(): Promise<string> {
    const startTime = Date.now();
    
    if (this.providers.size === 0) {
      if (this.config.verbose) {
        console.log('⚠️ No context providers registered');
      }
      return '';
    }

    if (this.config.verbose) {
      console.log(`🔄 Getting context from ${this.providers.size} providers...`);
    }

    // 获取所有启用的提供者
    const enabledProviders = await this.getEnabledProviders();
    
    if (enabledProviders.length === 0) {
      if (this.config.verbose) {
        console.log('⚠️ No enabled context providers found');
      }
      return '';
    }

    // 并发执行所有提供者
    const results = await this.executeProvidersWithTimeout(enabledProviders);

    // 按优先级组织结果
    const organizedResults = this.organizeResultsByPriority(results);

    // 生成组合上下文
    const combinedContext = this.formatCombinedContext(organizedResults);

    // 生成统计信息
    const stats = this.generateStats(results, Date.now() - startTime, combinedContext);
    
    if (this.config.verbose) {
      this.logStats(stats);
    }

    return combinedContext;
  }

  /**
   * 获取上下文执行的统计信息
   * 
   * @returns Promise<ContextStats> 统计信息
   */
  async getStats(): Promise<ContextStats> {
    const enabledProviders = await this.getEnabledProviders();
    
    return {
      totalProviders: this.providers.size,
      enabledProviders: enabledProviders.length,
      successfulProviders: 0, // 需要执行后才知道
      totalExecutionTime: 0,
      finalContextLength: 0
    };
  }

  /**
   * 获取所有启用的提供者
   * 
   * @returns Promise<ContextProvider[]> 启用的提供者数组
   */
  private async getEnabledProviders(): Promise<ContextProvider[]> {
    const enabledProviders: ContextProvider[] = [];
    
    for (const provider of this.providers.values()) {
      try {
        // 检查是否为扩展提供者
        if (this.isExtendedProvider(provider)) {
          const enabled = await provider.isEnabled();
          if (enabled) {
            enabledProviders.push(provider);
          } else if (this.config.verbose) {
            console.log(`⏸️ Provider ${provider.getProviderId()} is disabled`);
          }
        } else {
          // 基础提供者默认启用
          enabledProviders.push(provider);
        }
      } catch (error) {
        if (this.config.verbose) {
          console.error(`❌ Error checking if provider ${provider.getProviderId()} is enabled:`, error);
        }
      }
    }
    
    return enabledProviders;
  }

  /**
   * 检查提供者是否为扩展提供者
   * 
   * @param provider 提供者实例
   * @returns boolean
   */
  private isExtendedProvider(provider: ContextProvider): provider is ExtendedContextProvider {
    return 'isEnabled' in provider && typeof provider.isEnabled === 'function';
  }

  /**
   * 并发执行所有提供者，带超时控制
   * 
   * @param providers 要执行的提供者数组
   * @returns Promise<ProviderResult[]> 执行结果数组
   */
  private async executeProvidersWithTimeout(providers: ContextProvider[]): Promise<ProviderResult[]> {
    const promises = providers.map(async (provider): Promise<ProviderResult> => {
      const startTime = Date.now();
      
      try {
        // 创建超时Promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), this.config.timeout);
        });
        
        // 执行提供者并应用超时
        const context = await Promise.race([
          provider.getContext(),
          timeoutPromise
        ]);
        
        const executionTime = Date.now() - startTime;
        
        return {
          provider,
          context,
          executionTime,
          success: true
        };
        
      } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (this.config.verbose) {
          console.error(`❌ Provider ${provider.getProviderId()} failed: ${errorMessage}`);
        }
        
        return {
          provider,
          context: null,
          executionTime,
          success: false,
          error: errorMessage
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * 按优先级组织提供者结果
   * 
   * @param results 提供者执行结果
   * @returns 按优先级分组的结果
   */
  private organizeResultsByPriority(results: ProviderResult[]): Map<ContextPriority, ProviderResult[]> {
    const organized = new Map<ContextPriority, ProviderResult[]>();
    
    // 初始化所有优先级组
    Object.values(ContextPriority).forEach(priority => {
      if (typeof priority === 'number') {
        organized.set(priority, []);
      }
    });
    
    // 按优先级分组结果
    for (const result of results) {
      if (result.success && result.context) {
        const priority = this.isExtendedProvider(result.provider) 
          ? result.provider.getPriority() 
          : ContextPriority.MEDIUM;
        
        const group = organized.get(priority);
        if (group) {
          group.push(result);
        }
      }
    }
    
    return organized;
  }

  /**
   * 格式化组合上下文信息
   * 
   * @param organizedResults 按优先级组织的结果
   * @returns 格式化的上下文字符串
   */
  private formatCombinedContext(organizedResults: Map<ContextPriority, ProviderResult[]>): string {
    const sections: string[] = [];
    
    // 按优先级从高到低处理
    const sortedPriorities = Array.from(organizedResults.keys()).sort((a, b) => a - b);
    
    for (const priority of sortedPriorities) {
      const results = organizedResults.get(priority);
      if (!results || results.length === 0) continue;
      
      const priorityName = this.getPriorityName(priority);
      const sectionHeader = `\n=== ${priorityName} Context ===\n`;
      
      const contextItems: string[] = [];
      
      for (const result of results) {
        if (result.context) {
          let contextBlock = '';
          
          if (this.config.includeMetadata) {
            contextBlock += `## ${result.provider.getDescription()}\n`;
          }
          
          contextBlock += result.context.trim();
          contextItems.push(contextBlock);
        }
      }
      
      if (contextItems.length > 0) {
        sections.push(sectionHeader + contextItems.join('\n\n'));
      }
    }
    
    // 组合所有部分并检查长度限制
    let combined = sections.join('\n');
    
    if (this.config.maxTotalLength > 0 && combined.length > this.config.maxTotalLength) {
      combined = combined.substring(0, this.config.maxTotalLength - 3) + '...';
    }
    
    return combined;
  }

  /**
   * 获取优先级的人类可读名称
   * 
   * @param priority 优先级枚举值
   * @returns 优先级名称
   */
  private getPriorityName(priority: ContextPriority): string {
    switch (priority) {
      case ContextPriority.CRITICAL: return 'Critical';
      case ContextPriority.HIGH: return 'High Priority';
      case ContextPriority.MEDIUM: return 'Medium Priority';
      case ContextPriority.LOW: return 'Low Priority';
      default: return 'Unknown Priority';
    }
  }

  /**
   * 生成统计信息
   * 
   * @param results 执行结果
   * @param totalTime 总执行时间
   * @param finalContext 最终上下文字符串
   * @returns 统计信息
   */
  private generateStats(
    results: ProviderResult[], 
    totalTime: number, 
    finalContext: string
  ): ContextStats {
    const successful = results.filter(r => r.success).length;
    
    return {
      totalProviders: this.providers.size,
      enabledProviders: results.length,
      successfulProviders: successful,
      totalExecutionTime: totalTime,
      finalContextLength: finalContext.length
    };
  }

  /**
   * 输出统计信息到控制台
   * 
   * @param stats 统计信息
   */
  private logStats(stats: ContextStats): void {
    console.log('📊 Context Generation Stats:');
    console.log(`  Total Providers: ${stats.totalProviders}`);
    console.log(`  Enabled: ${stats.enabledProviders}`);
    console.log(`  Successful: ${stats.successfulProviders}`);
    console.log(`  Execution Time: ${stats.totalExecutionTime}ms`);
    console.log(`  Final Context Length: ${stats.finalContextLength} characters`);
  }

  /**
   * 清除所有已注册的提供者
   */
  clearAllProviders(): void {
    const count = this.providers.size;
    this.providers.clear();
    
    if (this.config.verbose) {
      console.log(`🧹 Cleared ${count} context providers`);
    }
  }

  /**
   * 更新配置
   * 
   * @param newConfig 新的配置选项
   */
  updateConfig(newConfig: Partial<ContextManagerConfig>): void {
    Object.assign(this.config, newConfig);
    
    if (this.config.verbose) {
      console.log('⚙️ ContextManager config updated:', newConfig);
    }
  }

  /**
   * 获取当前配置
   * 
   * @returns 当前配置的副本
   */
  getConfig(): Required<ContextManagerConfig> {
    return { ...this.config };
  }
}