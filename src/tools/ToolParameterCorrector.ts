import type { LanguageModel } from 'ai';
import { generateText } from 'ai';
import { z } from 'zod';

/**
 * 工具参数修正的结果接口
 */
interface ParameterCorrectionResult {
  /** 是否找到了修正方案 */
  corrected: boolean;
  /** 修正后的参数值 */
  correctedValue?: string;
  /** 修正详情说明 */
  explanation?: string;
  /** 置信度 (0-1) */
  confidence?: number;
}

/**
 * 参数修正选项接口
 */
interface CorrectionOptions {
  /** 最大尝试次数 */
  maxAttempts?: number;
  /** 最小置信度阈值 */
  minConfidence?: number;
  /** 是否启用详细日志 */
  verbose?: boolean;
}

/**
 * 工具参数修正器类
 * 使用轻量级AI模型来修正工具参数中的常见错误，如空格、换行符、转义字符等
 * 
 * @example
 * ```typescript
 * const corrector = new ToolParameterCorrector();
 * const result = await corrector.correctStringParameter(
 *   'const foo = "bar"', // 错误的参数
 *   fileContent,         // 文件内容上下文
 *   model               // 语言模型实例
 * );
 * 
 * if (result.corrected) {
 *   console.log('Corrected:', result.correctedValue);
 * }
 * ```
 */
export class ToolParameterCorrector {
  private readonly defaultOptions: Required<CorrectionOptions>;

  /**
   * 创建工具参数修正器实例
   * @param options 修正选项配置
   */
  constructor(options: CorrectionOptions = {}) {
    this.defaultOptions = {
      maxAttempts: 3,
      minConfidence: 0.7,
      verbose: false,
      ...options
    };
  }

  /**
   * 修正字符串参数
   * 当原参数在文件内容中找不到完全匹配时，尝试找到最接近的正确版本
   * 
   * @param originalParam 原始参数字符串
   * @param fileContent 文件内容上下文
   * @param model 用于修正的语言模型实例
   * @param options 修正选项（可选）
   * @returns Promise<ParameterCorrectionResult> 修正结果
   */
  public async correctStringParameter(
    originalParam: string,
    fileContent: string,
    model: LanguageModel,
    options: CorrectionOptions = {}
  ): Promise<ParameterCorrectionResult> {
    const opts = { ...this.defaultOptions, ...options };

    if (opts.verbose) {
      console.log(`🔧 Attempting to correct parameter: "${originalParam}"`);
    }

    // 首先检查原参数是否已经在文件中存在
    if (fileContent.includes(originalParam)) {
      if (opts.verbose) {
        console.log('✅ Original parameter found in file content - no correction needed');
      }
      return {
        corrected: false,
        correctedValue: originalParam,
        explanation: 'Original parameter is already correct',
        confidence: 1.0
      };
    }

    // 尝试使用AI进行修正
    try {
      const correctionResult = await this.performAICorrection(
        originalParam,
        fileContent,
        model,
        opts
      );

      if (opts.verbose) {
        if (correctionResult.corrected) {
          console.log(`✅ Successfully corrected: "${correctionResult.correctedValue}"`);
        } else {
          console.log('❌ Could not find a suitable correction');
        }
      }

      return correctionResult;
    } catch (error) {
      if (opts.verbose) {
        console.error('❌ Error during parameter correction:', error);
      }

      return {
        corrected: false,
        explanation: `Correction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * 使用AI模型执行参数修正
   * @param originalParam 原始参数
   * @param fileContent 文件内容
   * @param model 语言模型
   * @param options 选项
   * @returns Promise<ParameterCorrectionResult> 修正结果
   */
  private async performAICorrection(
    originalParam: string,
    fileContent: string,
    model: LanguageModel,
    options: Required<CorrectionOptions>
  ): Promise<ParameterCorrectionResult> {
    // 准备提示
    const systemPrompt = this.buildCorrectionSystemPrompt();
    const userPrompt = this.buildCorrectionUserPrompt(originalParam, fileContent);

    // 使用generateText获得结构化响应
    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.1 // 低温度以获得更一致的结果
    });

    // 解析AI响应
    try {
      const result = this.parseAIResponse(text);

      // 验证结果
      if (result.found && result.correctedValue && result.confidence >= options.minConfidence) {
        // 双重验证：确保修正后的值确实存在于文件中
        if (fileContent.includes(result.correctedValue)) {
          return {
            corrected: true,
            correctedValue: result.correctedValue,
            explanation: result.explanation,
            confidence: result.confidence
          };
        } else {
          return {
            corrected: false,
            explanation: 'AI suggested correction was not found in file content'
          };
        }
      }

      return {
        corrected: false,
        explanation: result.explanation || 'No suitable correction found'
      };
    } catch (error) {
      return {
        corrected: false,
        explanation: `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * 解析AI响应文本为结构化结果
   * @param responseText AI响应文本
   * @returns 解析后的结果
   */
  private parseAIResponse(responseText: string): {
    found: boolean;
    correctedValue?: string;
    explanation: string;
    confidence: number;
  } {
    // 尝试解析JSON响应
    // 查找JSON块
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        found: !!parsed.found,
        correctedValue: parsed.correctedValue || undefined,
        explanation: parsed.explanation || 'No explanation provided',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0
      };
    }

    // 回退到文本解析
    const lines = responseText.trim().split('\n');
    let found = false;
    let correctedValue: string | undefined;
    let explanation = 'No explanation provided';
    let confidence = 0;

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('found:') || lowerLine.includes('match:')) {
        found = lowerLine.includes('true') || lowerLine.includes('yes');
      } else if (lowerLine.includes('corrected:') || lowerLine.includes('value:')) {
        const match = line.match(/"([^"]*)"/);
        if (match) {
          correctedValue = match[1];
        }
      } else if (lowerLine.includes('explanation:') || lowerLine.includes('reason:')) {
        explanation = line.substring(line.indexOf(':') + 1).trim();
      } else if (lowerLine.includes('confidence:')) {
        const confMatch = line.match(/(\d+(?:\.\d+)?)/);
        if (confMatch) {
          confidence = parseFloat(confMatch[1]);
          if (confidence > 1) confidence = confidence / 100; // 转换百分比
        }
      }
    }

    return { found, correctedValue, explanation, confidence };
  }

  /**
   * 构建系统提示
   * @returns 系统提示字符串
   */
  private buildCorrectionSystemPrompt(): string {
    return `You are a precise code text matcher. Your task is to find the exact text in a file that most closely matches a given parameter, accounting for common formatting differences.

Common issues to look for and correct:
1. **Whitespace differences**: Extra/missing spaces, tabs vs spaces
2. **Line ending differences**: \\n vs \\r\\n, missing trailing newlines  
3. **Indentation differences**: Different levels of indentation
4. **Escape character issues**: Missing or incorrect escape sequences
5. **Quote differences**: Single vs double quotes
6. **Case sensitivity**: Sometimes parameters have wrong case

Your job:
- Find the text in the file that semantically matches the given parameter
- Account for the formatting differences listed above
- Return the EXACT text as it appears in the file
- Provide a confidence score based on how certain you are about the match
- If no reasonable match exists, indicate that clearly

Be very precise - the corrected value must be an exact substring that exists in the provided file content.

Please respond in JSON format:
{
  "found": true/false,
  "correctedValue": "exact text from file" (if found),
  "explanation": "what was corrected or why no match was found",
  "confidence": 0.0-1.0
}`;
  }

  /**
   * 构建用户提示
   * @param originalParam 原始参数
   * @param fileContent 文件内容
   * @returns 用户提示字符串
   */
  private buildCorrectionUserPrompt(originalParam: string, fileContent: string): string {
    // 限制文件内容长度以避免token限制
    const maxContentLength = 8000;
    let truncatedContent = fileContent;
    if (fileContent.length > maxContentLength) {
      // 尝试围绕可能的匹配位置截取内容
      const approxMatch = this.findApproximateMatchPosition(originalParam, fileContent);
      const start = Math.max(0, approxMatch - maxContentLength / 2);
      const end = Math.min(fileContent.length, start + maxContentLength);
      truncatedContent = fileContent.substring(start, end);
      if (start > 0) truncatedContent = '...' + truncatedContent;
      if (end < fileContent.length) truncatedContent = truncatedContent + '...';
    }

    return `Please find the text in the following file content that matches this parameter:

**Parameter to match:**
\`\`\`
${originalParam}
\`\`\`

**File content to search in:**
\`\`\`
${truncatedContent}
\`\`\`

Find the exact text in the file that this parameter is trying to reference, accounting for formatting differences like whitespace, indentation, or escape characters.`;
  }

  /**
   * 找到近似匹配位置，用于智能截取文件内容
   * @param searchText 搜索文本
   * @param content 文件内容
   * @returns 近似匹配的位置
   */
  private findApproximateMatchPosition(searchText: string, content: string): number {
    // 尝试各种简化的搜索策略
    const searches = [
      searchText,
      searchText.trim(),
      searchText.replace(/\s+/g, ' '),
      searchText.replace(/['"]/g, ''),
      searchText.toLowerCase()
    ];

    for (const search of searches) {
      const index = content.indexOf(search);
      if (index !== -1) {
        return index;
      }
    }

    // 如果都没找到，返回文件中间位置
    return content.length / 2;
  }

  /**
   * 批量修正多个参数
   * @param parameters 参数数组
   * @param fileContent 文件内容
   * @param model 语言模型
   * @param options 选项
   * @returns Promise<ParameterCorrectionResult[]> 修正结果数组
   */
  public async correctMultipleParameters(
    parameters: string[],
    fileContent: string,
    model: LanguageModel,
    options: CorrectionOptions = {}
  ): Promise<ParameterCorrectionResult[]> {
    const results: ParameterCorrectionResult[] = [];

    for (const param of parameters) {
      const result = await this.correctStringParameter(param, fileContent, model, options);
      results.push(result);
    }

    return results;
  }

  /**
   * 更新默认选项
   * @param newOptions 新的选项
   */
  public updateDefaultOptions(newOptions: Partial<CorrectionOptions>): void {
    Object.assign(this.defaultOptions, newOptions);
  }

  /**
   * 获取当前默认选项
   * @returns 当前默认选项
   */
  public getDefaultOptions(): Required<CorrectionOptions> {
    return { ...this.defaultOptions };
  }
}