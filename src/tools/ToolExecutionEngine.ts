import { LoopDetectionService } from '../services/LoopDetectionService.js';
import { ConfigLoader, Config } from '../config/ConfigLoader.js';

/**
 * 工具执行结果接口
 * 标准化所有工具的返回格式
 */
export interface ToolResult {
  /** 执行是否成功 */
  success: boolean;
  /** 执行结果数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
  /** 执行时间（毫秒） */
  executionTime: number;
  /** 工具名称 */
  toolName: string;
  /** 执行参数 */
  params: any;
  /** 是否被循环检测阻止 */
  blockedByLoop?: boolean;
  /** 是否超时 */
  timedOut?: boolean;
  /** 警告信息 */
  warnings?: string[];
  /** 调试信息 */
  debugInfo?: Record<string, any>;
}

/**
 * 工具执行前的Hook函数类型
 */
export type PreExecutionHook = (toolName: string, params: any, context: ToolExecutionContext) => Promise<boolean | string>;

/**
 * 工具执行后的Hook函数类型
 */
export type PostExecutionHook = (result: ToolResult, context: ToolExecutionContext) => Promise<void>;

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  /** 执行开始时间 */
  startTime: number;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 执行ID，用于跟踪和调试 */
  executionId: string;
  /** 用户ID或会话ID */
  sessionId?: string;
  /** 额外的上下文数据 */
  metadata?: Record<string, any>;
}

/**
 * 工具执行监控数据
 */
export interface ToolExecutionMetrics {
  /** 总执行次数 */
  totalExecutions: number;
  /** 成功执行次数 */
  successfulExecutions: number;
  /** 失败执行次数 */
  failedExecutions: number;
  /** 平均执行时间 */
  averageExecutionTime: number;
  /** 最近的错误 */
  recentErrors: Array<{ error: string; timestamp: Date; toolName: string }>;
  /** 最常使用的工具 */
  topTools: Array<{ toolName: string; count: number; successRate: number }>;
}

/**
 * 统一工具执行引擎
 * 提供标准化的工具执行接口和横切关注点处理
 */
export class ToolExecutionEngine {
  private loopDetectionService: LoopDetectionService;
  private config: Config;
  private preExecutionHooks: PreExecutionHook[] = [];
  private postExecutionHooks: PostExecutionHook[] = [];
  private registeredTools: Map<string, any> = new Map();
  private executionHistory: ToolResult[] = [];
  private metrics: ToolExecutionMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    recentErrors: [],
    topTools: []
  };

  constructor(
    configLoader: ConfigLoader,
    loopDetectionService: LoopDetectionService
  ) {
    this.config = configLoader.getConfig();
    this.loopDetectionService = loopDetectionService;
  }

  /**
   * 注册工具
   * @param name 工具名称
   * @param tool 工具实现
   */
  registerTool(name: string, tool: any): void {
    this.registeredTools.set(name, tool);
    console.log(`🔧 Tool registered: ${name}`);
  }

  /**
   * 注册多个工具
   * @param tools 工具映射
   */
  registerTools(tools: Record<string, any>): void {
    Object.entries(tools).forEach(([name, tool]) => {
      this.registerTool(name, tool);
    });
  }

  /**
   * 添加执行前Hook
   * @param hook Hook函数
   */
  addPreExecutionHook(hook: PreExecutionHook): void {
    this.preExecutionHooks.push(hook);
  }

  /**
   * 添加执行后Hook
   * @param hook Hook函数
   */
  addPostExecutionHook(hook: PostExecutionHook): void {
    this.postExecutionHooks.push(hook);
  }

  /**
   * 统一工具执行方法
   * 集成循环检测、参数验证、超时控制等功能
   * @param toolName 工具名称
   * @param params 执行参数
   * @param options 执行选项
   * @returns 执行结果
   */
  async executeWithGuards(
    toolName: string, 
    params: any,
    options: {
      timeout?: number;
      sessionId?: string;
      skipLoopDetection?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<ToolResult> {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();
    const timeout = options.timeout || this.config.tools?.shellExecutor?.defaultTimeout || 30000;
    
    const context: ToolExecutionContext = {
      startTime,
      timeout,
      executionId,
      sessionId: options.sessionId,
      metadata: options.metadata
    };

    // 构建基础结果对象
    const baseResult: Partial<ToolResult> = {
      toolName,
      params,
      executionTime: 0
    };

    try {
      // 1. 验证工具是否已注册
      if (!this.registeredTools.has(toolName)) {
        return this.createErrorResult(baseResult, `Tool '${toolName}' not registered`, startTime);
      }

      const tool = this.registeredTools.get(toolName);

      // 2. 参数验证
      const paramValidation = this.validateParameters(toolName, params, tool);
      if (!paramValidation.isValid) {
        return this.createErrorResult(baseResult, `Parameter validation failed: ${paramValidation.error}`, startTime);
      }

      // 3. 循环检测
      if (!options.skipLoopDetection) {
        const loopResult = this.loopDetectionService.detectLoop(toolName, params);
        if (loopResult.isLoop) {
          console.warn(`🔄 Loop detected for tool '${toolName}': ${loopResult.message}`);
          return {
            ...baseResult,
            success: false,
            error: `Loop detected: ${loopResult.message}`,
            executionTime: Date.now() - startTime,
            blockedByLoop: true,
            warnings: [loopResult.suggestion || 'Consider varying parameters or using different approach']
          } as ToolResult;
        }
      }

      // 4. 执行前Hook
      for (const hook of this.preExecutionHooks) {
        const hookResult = await hook(toolName, params, context);
        if (hookResult === false) {
          return this.createErrorResult(baseResult, 'Execution blocked by pre-execution hook', startTime);
        }
        if (typeof hookResult === 'string') {
          return this.createErrorResult(baseResult, `Pre-execution hook: ${hookResult}`, startTime);
        }
      }

      // 5. 执行工具（带超时控制）
      const result = await this.executeWithTimeout(tool, params, timeout);
      
      // 6. 构建最终结果
      const finalResult: ToolResult = {
        ...baseResult,
        success: result.success !== false,
        data: result.data || result,
        error: result.error,
        executionTime: Date.now() - startTime,
        warnings: result.warnings || [],
        debugInfo: {
          executionId,
          toolVersion: tool.version,
          configUsed: this.sanitizeConfig()
        }
      } as ToolResult;

      // 7. 执行后Hook
      for (const hook of this.postExecutionHooks) {
        await hook(finalResult, context);
      }

      // 8. 更新统计信息
      this.updateMetrics(finalResult);

      // 9. 添加到执行历史
      this.addToHistory(finalResult);

      return finalResult;

    } catch (error) {
      const errorResult = this.createErrorResult(
        baseResult, 
        error instanceof Error ? error.message : 'Unknown execution error',
        startTime,
        { originalError: error }
      );
      
      this.updateMetrics(errorResult);
      this.addToHistory(errorResult);
      
      return errorResult;
    }
  }

  /**
   * 带超时的工具执行
   * @param tool 工具实例
   * @param params 参数
   * @param timeout 超时时间
   * @returns 执行结果
   */
  private async executeWithTimeout(tool: any, params: any, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);

      // 执行工具
      const execution = tool.execute ? tool.execute(params) : tool(params);
      
      Promise.resolve(execution)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * 参数验证
   * @param toolName 工具名称
   * @param params 参数
   * @param tool 工具实例
   * @returns 验证结果
   */
  private validateParameters(toolName: string, params: any, tool: any): { isValid: boolean; error?: string } {
    try {
      // 如果工具定义了参数模式，使用zod验证
      if (tool.parameters && tool.parameters.parse) {
        tool.parameters.parse(params);
      }
      
      // 基础验证：检查必需参数
      if (tool.requiredParams) {
        for (const required of tool.requiredParams) {
          if (params[required] === undefined || params[required] === null) {
            return {
              isValid: false,
              error: `Missing required parameter: ${required}`
            };
          }
        }
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Parameter validation failed'
      };
    }
  }

  /**
   * 创建错误结果
   * @param baseResult 基础结果
   * @param error 错误信息
   * @param startTime 开始时间
   * @param debugInfo 调试信息
   * @returns 错误结果
   */
  private createErrorResult(
    baseResult: Partial<ToolResult>, 
    error: string, 
    startTime: number,
    debugInfo?: Record<string, any>
  ): ToolResult {
    return {
      ...baseResult,
      success: false,
      error,
      executionTime: Date.now() - startTime,
      debugInfo: {
        ...debugInfo,
        timestamp: new Date().toISOString()
      }
    } as ToolResult;
  }

  /**
   * 更新执行指标
   * @param result 执行结果
   */
  private updateMetrics(result: ToolResult): void {
    this.metrics.totalExecutions++;
    
    if (result.success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
      
      // 记录错误
      this.metrics.recentErrors.push({
        error: result.error || 'Unknown error',
        timestamp: new Date(),
        toolName: result.toolName
      });
      
      // 保持最近20个错误
      if (this.metrics.recentErrors.length > 20) {
        this.metrics.recentErrors = this.metrics.recentErrors.slice(-20);
      }
    }

    // 更新平均执行时间
    const totalTime = (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1)) + result.executionTime;
    this.metrics.averageExecutionTime = totalTime / this.metrics.totalExecutions;

    // 更新工具使用统计
    this.updateToolStats(result.toolName, result.success);
  }

  /**
   * 更新工具使用统计
   * @param toolName 工具名称
   * @param success 是否成功
   */
  private updateToolStats(toolName: string, success: boolean): void {
    let toolStat = this.metrics.topTools.find(t => t.toolName === toolName);
    
    if (!toolStat) {
      toolStat = { toolName, count: 0, successRate: 0 };
      this.metrics.topTools.push(toolStat);
    }
    
    const oldTotal = toolStat.count;
    const oldSuccesses = Math.round(oldTotal * toolStat.successRate);
    
    toolStat.count++;
    const newSuccesses = oldSuccesses + (success ? 1 : 0);
    toolStat.successRate = newSuccesses / toolStat.count;
    
    // 按使用次数排序
    this.metrics.topTools.sort((a, b) => b.count - a.count);
    
    // 保持前10个
    if (this.metrics.topTools.length > 10) {
      this.metrics.topTools = this.metrics.topTools.slice(0, 10);
    }
  }

  /**
   * 添加到执行历史
   * @param result 执行结果
   */
  private addToHistory(result: ToolResult): void {
    this.executionHistory.push(result);
    
    // 保持最近100条历史
    if (this.executionHistory.length > 100) {
      this.executionHistory = this.executionHistory.slice(-100);
    }
  }

  /**
   * 生成执行ID
   * @returns 执行ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 清理配置中的敏感信息用于调试
   * @returns 清理后的配置
   */
  private sanitizeConfig(): Record<string, any> {
    return {
      model: this.config.models && this.config.models.length > 0 
        ? `${this.config.models[0].provider}:${this.config.models[0].name}` 
        : 'No models configured',
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      toolsEnabled: Object.keys(this.registeredTools)
    };
  }

  /**
   * 获取执行指标
   * @returns 执行指标
   */
  getMetrics(): ToolExecutionMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取执行历史
   * @param limit 历史条数限制
   * @returns 执行历史
   */
  getExecutionHistory(limit?: number): ToolResult[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * 清除执行历史
   * @param reason 清除原因
   */
  clearExecutionHistory(reason: string = 'Manual clear'): void {
    console.log(`🗑️ Clearing tool execution history: ${reason}`);
    this.executionHistory = [];
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      recentErrors: [],
      topTools: []
    };
  }

  /**
   * 获取已注册的工具列表
   * @returns 工具名称数组
   */
  getRegisteredTools(): string[] {
    return Array.from(this.registeredTools.keys());
  }

  /**
   * 检查工具是否已注册
   * @param toolName 工具名称
   * @returns 是否已注册
   */
  isToolRegistered(toolName: string): boolean {
    return this.registeredTools.has(toolName);
  }

  /**
   * 获取工具信息
   * @param toolName 工具名称
   * @returns 工具信息
   */
  getToolInfo(toolName: string): any {
    const tool = this.registeredTools.get(toolName);
    if (!tool) return null;

    return {
      name: toolName,
      description: tool.description || 'No description available',
      parameters: tool.parameters || {},
      version: tool.version || '1.0.0',
      registered: true
    };
  }
}