/**
 * 工具调用记录接口
 * 记录单次工具调用的完整信息
 */
export interface ToolCallRecord {
  /** 工具名称 */
  toolName: string;
  /** 工具参数（序列化后的字符串，用于比较） */
  parameters: string;
  /** 原始参数对象（用于语义相似度分析） */
  rawParameters: any;
  /** 调用时间戳 */
  timestamp: number;
  /** 调用序号 */
  sequence: number;
  /** 参数指纹（用于快速比较） */
  parameterFingerprint: string;
}

/**
 * 循环检测结果接口
 */
export interface LoopDetectionResult {
  /** 是否检测到循环 */
  isLoop: boolean;
  /** 循环类型 */
  loopType?: 'exact_repeat' | 'alternating_pattern' | 'parameter_cycle' | 'tool_sequence' | 'semantic_similarity';
  /** 循环长度（连续重复次数） */
  loopLength?: number;
  /** 循环开始位置 */
  loopStart?: number;
  /** 相似度分数（0-1，仅适用于语义相似性检测） */
  similarityScore?: number;
  /** 详细描述 */
  description?: string;
  /** 建议行动 */
  suggestion?: string;
  /** 循环检测消息 */
  message?: string;
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
  /** 语义相似度阈值（0-1） */
  semanticSimilarityThreshold: number;
  /** 启用语义相似度检测 */
  enableSemanticDetection: boolean;
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
      semanticSimilarityThreshold: 0.85,
      enableSemanticDetection: true,
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
      rawParameters: toolCall.parameters,
      parameterFingerprint: this.generateParameterFingerprint(toolCall.parameters),
      timestamp: Date.now(),
      sequence: ++this.sequence
    };

    // 在检测之前先添加到历史记录
    this.addToHistory(record);

    // 执行循环检测
    const result = this.detectLoop(toolCall.toolName, toolCall.parameters);

    return result;
  }

  /**
   * 检测循环（外部调用接口）
   * @param toolName 工具名称
   * @param parameters 参数
   * @returns 检测结果
   */
  public detectLoop(toolName: string, parameters: any): LoopDetectionResult {
    if (this.history.length < 2) {
      return { isLoop: false };
    }

    // 检测精确重复
    const exactRepeatResult = this.detectExactRepeat();
    if (exactRepeatResult.isLoop) {
      return exactRepeatResult;
    }

    // 检测语义相似度（如果启用）
    if (this.config.enableSemanticDetection) {
      const semanticResult = this.detectSemanticSimilarity(toolName, parameters);
      if (semanticResult.isLoop) {
        return semanticResult;
      }
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
   * 生成参数指纹
   * @param parameters 参数对象
   * @returns 参数指纹字符串
   */
  private generateParameterFingerprint(parameters: any): string {
    try {
      // 提取关键字段创建指纹
      const keyFields = this.extractKeyFields(parameters);
      return JSON.stringify(keyFields);
    } catch {
      return this.serializeParameters(parameters);
    }
  }

  /**
   * 提取参数中的关键字段
   * @param parameters 参数对象
   * @returns 关键字段对象
   */
  private extractKeyFields(parameters: any): Record<string, any> {
    if (typeof parameters !== 'object' || parameters === null) {
      return { value: parameters };
    }

    const keyFields: Record<string, any> = {};
    
    // 常见的关键字段
    const importantKeys = ['command', 'query', 'path', 'file', 'url', 'message', 'content', 'action', 'method'];
    
    for (const key of importantKeys) {
      if (key in parameters) {
        keyFields[key] = parameters[key];
      }
    }

    // 如果没有找到关键字段，返回所有字段
    if (Object.keys(keyFields).length === 0) {
      return parameters;
    }

    return keyFields;
  }

  /**
   * 检测语义相似度
   * @param toolName 当前工具名称
   * @param parameters 当前参数
   * @returns 检测结果
   */
  private detectSemanticSimilarity(toolName: string, parameters: any): LoopDetectionResult {
    const recentSameTool = this.history
      .slice(-10) // 检查最近10次调用
      .filter(record => record.toolName === toolName)
      .slice(-5); // 最多比较5次

    if (recentSameTool.length < 2) {
      return { isLoop: false };
    }

    const currentFingerprint = this.generateParameterFingerprint(parameters);
    
    for (let i = recentSameTool.length - 2; i >= 0; i--) {
      const previousRecord = recentSameTool[i];
      const similarity = this.calculateSemanticSimilarity(
        currentFingerprint,
        previousRecord.parameterFingerprint,
        parameters,
        previousRecord.rawParameters
      );

      if (similarity >= this.config.semanticSimilarityThreshold) {
        // 检查时间间隔，避免误报快速连续的相似调用
        const timeGap = Date.now() - previousRecord.timestamp;
        if (timeGap > 5000) { // 5秒以上间隔才认为是语义循环
          return {
            isLoop: true,
            loopType: 'semantic_similarity',
            similarityScore: similarity,
            description: `检测到语义相似的循环：工具 '${toolName}' 使用了语义相似的参数`,
            message: `语义相似度: ${(similarity * 100).toFixed(1)}%`,
            suggestion: `当前操作与之前的操作在语义上相似。建议检查是否真的需要重复执行，或尝试不同的参数。`
          };
        }
      }
    }

    return { isLoop: false };
  }

  /**
   * 计算语义相似度
   * @param fingerprint1 参数指纹1
   * @param fingerprint2 参数指纹2
   * @param params1 原始参数1
   * @param params2 原始参数2
   * @returns 相似度分数 (0-1)
   */
  private calculateSemanticSimilarity(
    fingerprint1: string, 
    fingerprint2: string,
    params1: any,
    params2: any
  ): number {
    // 如果指纹完全相同，相似度为1
    if (fingerprint1 === fingerprint2) {
      return 1.0;
    }

    try {
      const obj1 = JSON.parse(fingerprint1);
      const obj2 = JSON.parse(fingerprint2);

      // 计算字段重叠度
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);
      const commonKeys = keys1.filter(key => keys2.includes(key));
      
      if (commonKeys.length === 0) {
        return 0;
      }

      let totalSimilarity = 0;
      let weightSum = 0;

      for (const key of commonKeys) {
        const value1 = obj1[key];
        const value2 = obj2[key];
        const weight = this.getFieldWeight(key);
        
        let fieldSimilarity = 0;
        
        if (typeof value1 === 'string' && typeof value2 === 'string') {
          fieldSimilarity = this.calculateStringSimilarity(value1, value2);
        } else if (value1 === value2) {
          fieldSimilarity = 1.0;
        } else if (typeof value1 === typeof value2) {
          fieldSimilarity = 0.5; // 同类型但不同值
        }
        
        totalSimilarity += fieldSimilarity * weight;
        weightSum += weight;
      }

      return weightSum > 0 ? totalSimilarity / weightSum : 0;
    } catch {
      // 如果解析失败，使用字符串相似度
      return this.calculateStringSimilarity(fingerprint1, fingerprint2);
    }
  }

  /**
   * 获取字段权重
   * @param fieldName 字段名
   * @returns 权重值
   */
  private getFieldWeight(fieldName: string): number {
    const weights: Record<string, number> = {
      command: 1.0,
      query: 1.0,
      message: 1.0,
      content: 1.0,
      path: 0.8,
      file: 0.8,
      url: 0.8,
      action: 0.9,
      method: 0.9,
    };
    
    return weights[fieldName.toLowerCase()] || 0.5;
  }

  /**
   * 计算字符串相似度（使用编辑距离）
   * @param str1 字符串1
   * @param str2 字符串2
   * @returns 相似度分数 (0-1)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0;

    // 使用简化的编辑距离算法
    const editDistance = this.calculateEditDistance(str1.toLowerCase(), str2.toLowerCase());
    const maxLength = Math.max(str1.length, str2.length);
    
    return 1 - (editDistance / maxLength);
  }

  /**
   * 计算编辑距离
   * @param str1 字符串1
   * @param str2 字符串2
   * @returns 编辑距离
   */
  private calculateEditDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 为不同类型的循环提供针对性建议
   * @param loopResult 循环检测结果
   * @returns 建议字符串
   */
  public suggestBreakStrategy(loopResult: LoopDetectionResult): string {
    if (!loopResult.isLoop) {
      return '当前没有检测到循环，可以继续正常执行。';
    }

    const baseStrategies = {
      exact_repeat: [
        '停止重复相同的操作',
        '检查上一次执行的结果是否达到预期',
        '如果结果不正确，分析失败原因并调整参数',
        '考虑是否需要不同的工具或方法',
        '请求用户确认是否继续或提供新的指令'
      ],
      alternating_pattern: [
        '停止在两个工具之间交替执行',
        '分析两个工具的执行结果是否相互冲突',
        '检查是否需要按特定顺序执行这些工具',
        '考虑合并操作或使用单一工具完成任务',
        '寻求用户指导以打破交替模式'
      ],
      parameter_cycle: [
        '停止在不同参数间循环',
        '分析哪些参数组合已经尝试过',
        '确定有效的参数范围或约束',
        '考虑问题是否需要不同的解决方案',
        '请求用户提供更具体的参数指导'
      ],
      tool_sequence: [
        '停止重复相同的工具序列',
        '分析整个序列的执行结果',
        '检查序列中是否有步骤失败或产生了错误结果',
        '考虑调整序列顺序或使用不同的工具组合',
        '寻求用户确认预期的工作流程'
      ],
      semantic_similarity: [
        '当前操作与之前的操作在意图上相似',
        '检查之前相似操作的结果是否满足需求',
        '如果需要重复执行，请明确说明原因',
        '考虑使用更精确或不同的参数',
        '确认当前操作确实是必要的'
      ]
    };

    const strategies = baseStrategies[loopResult.loopType!] || ['请分析当前情况并调整策略'];
    
    let suggestion = `**检测到 ${loopResult.loopType} 类型的循环**\n\n`;
    suggestion += `**建议的解决策略：**\n`;
    
    strategies.forEach((strategy, index) => {
      suggestion += `${index + 1}. ${strategy}\n`;
    });

    // 添加特定于循环类型的额外建议
    if (loopResult.loopType === 'semantic_similarity' && loopResult.similarityScore) {
      suggestion += `\n**语义相似度：** ${(loopResult.similarityScore * 100).toFixed(1)}%\n`;
      suggestion += `相似度越高，重复执行的必要性越需要仔细考虑。`;
    }

    if (loopResult.loopLength && loopResult.loopLength > 5) {
      suggestion += `\n**注意：** 已重复 ${loopResult.loopLength} 次，强烈建议立即停止并重新评估方法。`;
    }

    return suggestion;
  }

  /**
   * 重置循环检测历史
   * @param reason 重置原因
   */
  public resetDetectionHistory(reason: string): void {
    console.log(`🔄 重置循环检测历史: ${reason}`);
    const previousCount = this.history.length;
    this.history = [];
    this.sequence = 0;
    console.log(`✅ 已清除 ${previousCount} 条历史记录`);
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
   * 执行循环检测（内部方法）
   * @returns 检测结果
   */
  private detectLoopInternal(): LoopDetectionResult {
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