/**
 * 简化的高级Diff算法
 * 提供基础的文本差异比较功能
 */

export interface DiffOperation {
  type: 'insert' | 'delete' | 'equal' | 'replace';
  oldStart: number;
  newStart: number;
  content: string;
  oldContent?: string;
}

export interface DiffResult {
  operations: DiffOperation[];
  additions: number;
  deletions: number;
  unchanged: number;
}

/**
 * 简化的高级Diff算法类
 */
export class AdvancedDiffAlgorithm {
  /**
   * 简单的行级diff算法
   * @param original 原始文本
   * @param modified 修改后文本
   * @returns diff结果
   */
  static simpleDiff(original: string, modified: string): DiffResult {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const operations: DiffOperation[] = [];
    
    let additions = 0;
    let deletions = 0;
    let unchanged = 0;
    
    const maxLength = Math.max(originalLines.length, modifiedLines.length);
    
    for (let i = 0; i < maxLength; i++) {
      const originalLine = originalLines[i];
      const modifiedLine = modifiedLines[i];
      
      if (originalLine === undefined) {
        // 新增行
        operations.push({
          type: 'insert',
          oldStart: i,
          newStart: i,
          content: modifiedLine
        });
        additions++;
      } else if (modifiedLine === undefined) {
        // 删除行
        operations.push({
          type: 'delete',
          oldStart: i,
          newStart: i,
          content: originalLine
        });
        deletions++;
      } else if (originalLine === modifiedLine) {
        // 相同行
        operations.push({
          type: 'equal',
          oldStart: i,
          newStart: i,
          content: originalLine
        });
        unchanged++;
      } else {
        // 修改行
        operations.push({
          type: 'replace',
          oldStart: i,
          newStart: i,
          content: modifiedLine,
          oldContent: originalLine
        });
        additions++;
        deletions++;
      }
    }
    
    return {
      operations,
      additions,
      deletions,
      unchanged
    };
  }

  /**
   * 生成unified diff格式
   * @param originalContent 原始内容
   * @param modifiedContent 修改后内容
   * @param originalPath 原始文件路径
   * @param modifiedPath 修改后文件路径
   * @returns unified diff字符串
   */
  static generateUnifiedDiff(
    originalContent: string,
    modifiedContent: string,
    originalPath: string = 'a/file',
    modifiedPath: string = 'b/file'
  ): string {
    const diffResult = this.simpleDiff(originalContent, modifiedContent);
    const lines: string[] = [
      `--- ${originalPath}`,
      `+++ ${modifiedPath}`
    ];

    // 简化的hunk生成
    if (diffResult.operations.length > 0) {
      const hunkHeader = `@@ -1,${originalContent.split('\n').length} +1,${modifiedContent.split('\n').length} @@`;
      lines.push(hunkHeader);

      for (const op of diffResult.operations) {
        switch (op.type) {
          case 'equal':
            lines.push(` ${op.content}`);
            break;
          case 'delete':
            lines.push(`-${op.content}`);
            break;
          case 'insert':
            lines.push(`+${op.content}`);
            break;
          case 'replace':
            lines.push(`-${op.oldContent}`);
            lines.push(`+${op.content}`);
            break;
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 计算相似度
   * @param original 原始文本
   * @param modified 修改后文本
   * @returns 相似度(0-1)
   */
  static calculateSimilarity(original: string, modified: string): number {
    const diffResult = this.simpleDiff(original, modified);
    const totalLines = Math.max(original.split('\n').length, modified.split('\n').length);
    
    if (totalLines === 0) return 1.0;
    
    return diffResult.unchanged / totalLines;
  }

  /**
   * 智能合并相邻的修改行
   * @param operations 原始操作数组
   * @returns 合并后的操作数组
   */
  static smartMergeChanges(operations: DiffOperation[]): DiffOperation[] {
    const mergedOperations: DiffOperation[] = [];
    let i = 0;
    
    while (i < operations.length) {
      const current = operations[i];
      
      if (current.type === 'delete' && i + 1 < operations.length) {
        const next = operations[i + 1];
        
        if (next.type === 'insert') {
          // 将相邻的删除和插入合并为替换
          mergedOperations.push({
            type: 'replace',
            oldStart: current.oldStart,
            newStart: next.newStart,
            content: next.content,
            oldContent: current.content
          });
          i += 2;
          continue;
        }
      }
      
      mergedOperations.push(current);
      i++;
    }
    
    return mergedOperations;
  }
}

/**
 * Diff工具函数
 */
export class DiffUtils {
  /**
   * 检测是否只有空白字符变化
   * @param original 原始文本
   * @param modified 修改后文本
   * @returns 是否只是空白字符变化
   */
  static detectWhitespaceChanges(original: string, modified: string): boolean {
    const normalizeWhitespace = (text: string) => text.replace(/\s+/g, ' ').trim();
    return normalizeWhitespace(original) === normalizeWhitespace(modified);
  }

  /**
   * 生成diff统计报告
   * @param diffResult diff结果
   * @returns 统计报告字符串
   */
  static generateDiffReport(diffResult: DiffResult): string {
    const total = diffResult.additions + diffResult.deletions + diffResult.unchanged;
    const changePercentage = total > 0 ? ((diffResult.additions + diffResult.deletions) / total * 100).toFixed(1) : '0.0';
    
    return [
      `📊 Diff Report:`,
      `   Total lines: ${total}`,
      `   Unchanged: ${diffResult.unchanged}`,
      `   Added: ${diffResult.additions}`,
      `   Deleted: ${diffResult.deletions}`,
      `   Change ratio: ${changePercentage}%`
    ].join('\n');
  }

  /**
   * 检测是否为大型重构
   * @param diffResult diff结果
   * @returns 是否为大型重构
   */
  static detectMajorRefactoring(diffResult: DiffResult): boolean {
    const total = diffResult.additions + diffResult.deletions + diffResult.unchanged;
    if (total === 0) return false;
    
    const changeRatio = (diffResult.additions + diffResult.deletions) / total;
    return changeRatio > 0.7; // 70%以上的修改被认为是大型重构
  }
}