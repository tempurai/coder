/**
 * 工具调用记录接口
 * 记录单次工具调用的完整信息
 */
export interface ToolCallRecord {
  /** 工具名称 */
  toolName: string;
  /** 工具参数（序列化后的字符串，用于比较） */
  parameters: string;
  /** 调用时间戳 */
  timestamp: number;
  /** 调用序号 */
  sequence: number;
}

/**
 * 循环检测结果接口
 */
export interface LoopDetectionResult {
  /** 是否检测到循环 */
  isLoop: boolean;
  /** 循环类型 */
  loopType?: 'exact_repeat' | 'alternating_pattern' | 'parameter_cycle' | 'tool_sequence';
  /** 循环长度（连续重复次数） */
  loopLength?: number;
  /** 循环开始位置 */
  loopStart?: number;
  /** 详细描述 */
  description?: string;
  /** 建议行动 */
  suggestion?: string;
}

/**
 * 循环检测配置接口
 */
export interface LoopDetectionConfig {
  /** 历史记录最大长度 */
  maxHistorySize: number;
  /** 检测精确重复的最小次数 */
  exactRepeatThreshold: number;
  /** 检测交替模式的最小次数 */
  alternatingPatternThreshold: number;
  /** 检测参数循环的最小次数 */
  parameterCycleThreshold: number;
  /** 相同工具短时间内调用的时间窗口（毫秒） */
  timeWindowMs: number;
  /** 参数相似度阈值（0-1） */
  parameterSimilarityThreshold: number;
}

/**
 * 循环检测服务
 * 
 * 负责检测 AI Agent 的工具调用是否陷入重复循环模式，
 * 支持多种循环模式识别，防止资源浪费和无效操作。
 * 
 * @example
 * ```typescript
 * const detector = new LoopDetectionService();
 * const result = detector.addAndCheck({
 *   toolName: 'shell_executor',
 *   parameters: JSON.stringify({ command: 'git status' })
 * });
 * 
 * if (result.isLoop) {
 *   console.log(`检测到循环: ${result.description}`);
 *   // 停止执行并请求用户介入
 * }
 * ```
 */
export class LoopDetectionService {
  private history: ToolCallRecord[] = [];
  private sequence: number = 0;
  private config: LoopDetectionConfig;

  /**
   * 创建循环检测服务实例
   * @param config 可选的自定义配置
   */
  constructor(config?: Partial<LoopDetectionConfig>) {
    this.config = {
      maxHistorySize: 20,
      exactRepeatThreshold: 3,
      alternatingPatternThreshold: 4,
      parameterCycleThreshold: 5,
      timeWindowMs: 30000, // 30秒
      parameterSimilarityThreshold: 0.9,
      ...config
    };
  }

  /**
   * 添加工具调用记录并检测循环
   * @param toolCall 工具调用信息
   * @returns 循环检测结果
   */
  public addAndCheck(toolCall: { toolName: string; parameters: any }): LoopDetectionResult {
    // 创建记录
    const record: ToolCallRecord = {
      toolName: toolCall.toolName,
      parameters: this.serializeParameters(toolCall.parameters),
      timestamp: Date.now(),
      sequence: ++this.sequence
    };

    // 在检测之前先添加到历史记录
    this.addToHistory(record);

    // 执行循环检测
    const result = this.detectLoop();

    return result;
  }

  /**
   * 序列化参数为字符串
   * @param parameters 参数对象
   * @returns 序列化后的字符串
   */
  private serializeParameters(parameters: any): string {
    try {
      if (typeof parameters === 'string') {
        return parameters;
      }
      // 对对象键进行排序以确保一致性
      if (typeof parameters === 'object' && parameters !== null) {
        const sorted = this.sortObjectKeys(parameters);
        return JSON.stringify(sorted);
      }
      return JSON.stringify(parameters);
    } catch (error) {
      // 如果序列化失败，返回字符串表示
      return String(parameters);
    }
  }

  /**
   * 递归排序对象键
   * @param obj 要排序的对象
   * @returns 键已排序的新对象
   */
  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sorted: any = {};
      Object.keys(obj).sort().forEach(key => {
        sorted[key] = this.sortObjectKeys(obj[key]);
      });
      return sorted;
    }
    
    return obj;
  }

  /**
   * 添加记录到历史
   * @param record 工具调用记录
   */
  private addToHistory(record: ToolCallRecord): void {
    this.history.push(record);
    
    // 保持历史记录在最大长度内
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * 执行循环检测
   * @returns 检测结果
   */
  private detectLoop(): LoopDetectionResult {
    if (this.history.length < 2) {
      return { isLoop: false };
    }

    // 检测精确重复
    const exactRepeatResult = this.detectExactRepeat();
    if (exactRepeatResult.isLoop) {
      return exactRepeatResult;
    }

    // 检测交替模式
    const alternatingResult = this.detectAlternatingPattern();
    if (alternatingResult.isLoop) {
      return alternatingResult;
    }

    // 检测参数循环
    const parameterCycleResult = this.detectParameterCycle();
    if (parameterCycleResult.isLoop) {
      return parameterCycleResult;
    }

    // 检测工具序列循环
    const sequenceResult = this.detectToolSequence();
    if (sequenceResult.isLoop) {
      return sequenceResult;
    }

    return { isLoop: false };
  }

  /**
   * 检测精确重复
   * 同样的工具和参数连续重复调用
   */
  private detectExactRepeat(): LoopDetectionResult {
    if (this.history.length < this.config.exactRepeatThreshold) {
      return { isLoop: false };
    }

    const lastRecord = this.history[this.history.length - 1];
    let repeatCount = 1;

    // 从后往前检查连续重复
    for (let i = this.history.length - 2; i >= 0; i--) {
      const record = this.history[i];
      if (record.toolName === lastRecord.toolName && 
          record.parameters === lastRecord.parameters) {
        repeatCount++;
      } else {
        break;
      }
    }

    if (repeatCount >= this.config.exactRepeatThreshold) {
      return {
        isLoop: true,
        loopType: 'exact_repeat',
        loopLength: repeatCount,
        loopStart: this.history.length - repeatCount,
        description: `检测到精确重复循环：工具 '${lastRecord.toolName}' 连续执行 ${repeatCount} 次相同操作`,
        suggestion: `建议停止重复操作，检查工具执行结果或修改参数。如果是预期行为，请明确告知。`
      };
    }

    return { isLoop: false };
  }

  /**
   * 检测交替模式
   * 两种工具调用交替出现
   */
  private detectAlternatingPattern(): LoopDetectionResult {
    if (this.history.length < this.config.alternatingPatternThreshold) {
      return { isLoop: false };
    }

    const recent = this.history.slice(-this.config.alternatingPatternThreshold);
    
    // 检查是否为 A-B-A-B 模式
    for (let i = 0; i < recent.length - 3; i += 2) {
      const a1 = recent[i];
      const b1 = recent[i + 1];
      const a2 = recent[i + 2];
      const b2 = recent[i + 3];

      if (a1.toolName === a2.toolName && 
          b1.toolName === b2.toolName &&
          a1.parameters === a2.parameters &&
          b1.parameters === b2.parameters &&
          a1.toolName !== b1.toolName) {
        
        return {
          isLoop: true,
          loopType: 'alternating_pattern',
          loopLength: 2,
          loopStart: this.history.length - 4,
          description: `检测到交替模式循环：工具 '${a1.toolName}' 和 '${b1.toolName}' 交替执行`,
          suggestion: `两个工具的执行结果可能相互冲突或无效。建议检查工具间的依赖关系或执行顺序。`
        };
      }
    }

    return { isLoop: false };
  }

  /**
   * 检测参数循环
   * 同一工具使用不同参数但形成循环模式
   */
  private detectParameterCycle(): LoopDetectionResult {
    if (this.history.length < this.config.parameterCycleThreshold) {
      return { isLoop: false };
    }

    const recentSameTool = this.history
      .slice(-this.config.parameterCycleThreshold * 2) // 检查更多记录
      .filter(record => record.toolName === this.history[this.history.length - 1].toolName);

    if (recentSameTool.length < this.config.parameterCycleThreshold) {
      return { isLoop: false };
    }

    // 检查是否存在参数循环
    const parameterGroups = new Map<string, number>();
    recentSameTool.forEach(record => {
      const count = parameterGroups.get(record.parameters) || 0;
      parameterGroups.set(record.parameters, count + 1);
    });

    // 如果有参数重复出现多次，可能形成循环
    for (const [parameters, count] of parameterGroups) {
      if (count >= 3) {
        return {
          isLoop: true,
          loopType: 'parameter_cycle',
          loopLength: count,
          description: `检测到参数循环：工具 '${this.history[this.history.length - 1].toolName}' 在多种参数间循环执行`,
          suggestion: `参数变化可能无效或存在逻辑错误。建议检查参数生成逻辑或确认预期结果。`
        };
      }
    }

    return { isLoop: false };
  }

  /**
   * 检测工具序列循环
   * 一组工具的调用序列重复出现
   */
  private detectToolSequence(): LoopDetectionResult {
    if (this.history.length < 6) { // 至少需要6个调用来检测3-2序列
      return { isLoop: false };
    }

    // 检查长度为2和3的序列模式
    for (const sequenceLength of [2, 3]) {
      if (this.history.length < sequenceLength * 2) continue;

      const recent = this.history.slice(-sequenceLength * 2);
      const firstHalf = recent.slice(0, sequenceLength);
      const secondHalf = recent.slice(sequenceLength);

      // 检查两个序列是否相同
      const isSequenceMatch = firstHalf.every((record, index) => {
        const corresponding = secondHalf[index];
        return record.toolName === corresponding.toolName && 
               record.parameters === corresponding.parameters;
      });

      if (isSequenceMatch) {
        const toolNames = firstHalf.map(r => r.toolName).join(' → ');
        return {
          isLoop: true,
          loopType: 'tool_sequence',
          loopLength: sequenceLength,
          loopStart: this.history.length - sequenceLength * 2,
          description: `检测到工具序列循环：序列 [${toolNames}] 重复执行`,
          suggestion: `工具执行序列重复，可能表明当前方法无效。建议尝试不同的解决方案或寻求用户指导。`
        };
      }
    }

    return { isLoop: false };
  }

  /**
   * 获取当前历史记录
   * @returns 历史记录副本
   */
  public getHistory(): ToolCallRecord[] {
    return [...this.history];
  }

  /**
   * 清空历史记录
   */
  public clearHistory(): void {
    this.history = [];
    this.sequence = 0;
  }

  /**
   * 获取统计信息
   * @returns 统计信息对象
   */
  public getStats(): {
    totalCalls: number;
    uniqueTools: number;
    recentTimespan: number;
    mostUsedTool: string | null;
  } {
    const uniqueTools = new Set(this.history.map(r => r.toolName));
    const toolCounts = new Map<string, number>();
    
    this.history.forEach(record => {
      toolCounts.set(record.toolName, (toolCounts.get(record.toolName) || 0) + 1);
    });

    let mostUsedTool: string | null = null;
    let maxCount = 0;
    for (const [tool, count] of toolCounts) {
      if (count > maxCount) {
        mostUsedTool = tool;
        maxCount = count;
      }
    }

    const recentTimespan = this.history.length > 0 
      ? Date.now() - this.history[0].timestamp 
      : 0;

    return {
      totalCalls: this.history.length,
      uniqueTools: uniqueTools.size,
      recentTimespan,
      mostUsedTool
    };
  }

  /**
   * 设置配置
   * @param config 新的配置项
   */
  public updateConfig(config: Partial<LoopDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   * @returns 当前配置副本
   */
  public getConfig(): LoopDetectionConfig {
    return { ...this.config };
  }
}