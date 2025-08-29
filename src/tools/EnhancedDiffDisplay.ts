/**
 * 简化的增强Diff显示工具
 * 提供美观的diff输出格式
 */

export interface DiffDisplayOptions {
  showLineNumbers?: boolean;
  contextLines?: number;
  colorOutput?: boolean;
  maxWidth?: number;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  lineNumber?: number;
}

/**
 * 增强的Diff显示配置
 */
export const enhancedDiffDisplayConfig = {
  id: 'enhanced_diff_display',
  name: 'Enhanced Diff Display',
  description: 'Display beautiful, formatted diff output with colors and line numbers',
  
  /**
   * 格式化并显示diff输出
   * @param diffLines diff行数组
   * @param options 显示选项
   * @returns 格式化的diff字符串
   */
  formatDiff(diffLines: DiffLine[], options: DiffDisplayOptions = {}): string {
    const {
      showLineNumbers = true,
      contextLines = 3,
      colorOutput = true,
      maxWidth = 120
    } = options;

    const lines: string[] = [];
    
    // 添加头部
    lines.push('─'.repeat(maxWidth));
    lines.push('📝 Enhanced Diff Output');
    lines.push('─'.repeat(maxWidth));

    for (const line of diffLines) {
      let formattedLine = '';
      
      // 添加行号
      if (showLineNumbers && line.lineNumber !== undefined) {
        formattedLine += `${String(line.lineNumber).padStart(4)} `;
      }

      // 添加diff标记和内容
      switch (line.type) {
        case 'added':
          formattedLine += colorOutput ? `\u001b[32m+ ${line.content}\u001b[0m` : `+ ${line.content}`;
          break;
        case 'removed':
          formattedLine += colorOutput ? `\u001b[31m- ${line.content}\u001b[0m` : `- ${line.content}`;
          break;
        case 'context':
          formattedLine += colorOutput ? `\u001b[37m  ${line.content}\u001b[0m` : `  ${line.content}`;
          break;
      }

      lines.push(formattedLine);
    }

    lines.push('─'.repeat(maxWidth));
    return lines.join('\n');
  },

  /**
   * 创建简单的diff
   * @param oldContent 原始内容
   * @param newContent 新内容
   * @returns DiffLine数组
   */
  createSimpleDiff(oldContent: string, newContent: string): DiffLine[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diffLines: DiffLine[] = [];
    
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine === newLine) {
        diffLines.push({
          type: 'context',
          content: oldLine,
          lineNumber: i + 1
        });
      } else {
        if (oldLines[i] !== undefined) {
          diffLines.push({
            type: 'removed',
            content: oldLine,
            lineNumber: i + 1
          });
        }
        if (newLines[i] !== undefined) {
          diffLines.push({
            type: 'added',
            content: newLine,
            lineNumber: i + 1
          });
        }
      }
    }
    
    return diffLines;
  }
};