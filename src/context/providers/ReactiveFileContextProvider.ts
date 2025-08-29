import * as fs from 'fs';
import * as path from 'path';
import { BaseContextProvider, ContextPriority } from '../ContextProvider';

/**
 * 响应式文件上下文提供者
 * 
 * 根据用户输入动态注入特定文件的完整内容作为上下文。
 * 这个提供者是临时性的，每次获取上下文后会自动清空文件列表。
 */
export class ReactiveFileContextProvider extends BaseContextProvider {
  private filePaths: string[] = [];

  /**
   * 构造函数
   */
  constructor() {
    super(
      'reactive-files',
      '动态注入用户输入中提到的文件内容',
      ContextPriority.HIGH, // 高优先级，确保文件内容在项目摘要之后显示
      20000 // 20k字符限制，允许较大的文件内容
    );
  }

  /**
   * 添加文件路径到待处理列表
   * 
   * @param filePaths 文件路径列表
   */
  public addFiles(filePaths: string[]): void {
    // 过滤重复路径并添加到列表
    const newPaths = filePaths.filter(filePath => !this.filePaths.includes(filePath));
    this.filePaths.push(...newPaths);
  }

  /**
   * 获取文件内容上下文
   * 注意：获取后会自动清空文件列表
   */
  async getContext(): Promise<string | null> {
    // 如果没有文件需要处理，返回null
    if (this.filePaths.length === 0) {
      return null;
    }

    const fileContents: string[] = [];
    const processedFiles: string[] = [];

    // 读取所有文件内容
    for (const filePath of this.filePaths) {
      try {
        // 解析绝对路径
        const absolutePath = path.resolve(filePath);
        
        // 检查文件是否存在
        if (!fs.existsSync(absolutePath)) {
          fileContents.push(`--- File: ${filePath} ---\n❌ 文件不存在`);
          continue;
        }

        // 检查是否是文件（非目录）
        const stats = fs.statSync(absolutePath);
        if (!stats.isFile()) {
          fileContents.push(`--- File: ${filePath} ---\n❌ 路径不是文件`);
          continue;
        }

        // 检查文件大小（限制单个文件不超过5MB）
        const maxFileSize = 5 * 1024 * 1024; // 5MB
        if (stats.size > maxFileSize) {
          fileContents.push(`--- File: ${filePath} ---\n❌ 文件过大 (${Math.round(stats.size / 1024 / 1024)}MB > 5MB)`);
          continue;
        }

        // 读取文件内容
        const content = fs.readFileSync(absolutePath, 'utf-8');
        
        // 格式化文件内容
        const formattedContent = `--- File: ${filePath} ---
${this.addLineNumbers(content)}
--- End of ${filePath} ---`;
        
        fileContents.push(formattedContent);
        processedFiles.push(filePath);

      } catch (error) {
        fileContents.push(`--- File: ${filePath} ---\n❌ 读取错误: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    // 清空文件列表（重要：确保上下文只在当前轮对话中生效）
    this.filePaths = [];

    // 如果没有成功读取任何文件，返回null
    if (fileContents.length === 0) {
      return null;
    }

    // 构建最终的上下文字符串
    const context = `## 📄 Referenced Files

${fileContents.join('\n\n')}

总共加载了 ${processedFiles.length} 个文件的内容。`;

    return this.truncateContext(context);
  }

  /**
   * 检查提供者是否启用
   * 只有当有文件需要处理时才启用
   */
  async isEnabled(): Promise<boolean> {
    return this.filePaths.length > 0;
  }

  /**
   * 为文件内容添加行号
   * 
   * @param content 文件内容
   * @returns 带行号的内容
   */
  private addLineNumbers(content: string): string {
    const lines = content.split('\n');
    const maxLineNumberWidth = String(lines.length).length;
    
    return lines
      .map((line, index) => {
        const lineNumber = (index + 1).toString().padStart(maxLineNumberWidth, ' ');
        return `${lineNumber}→${line}`;
      })
      .join('\n');
  }

  /**
   * 获取当前待处理的文件数量（用于调试）
   */
  public getPendingFileCount(): number {
    return this.filePaths.length;
  }

  /**
   * 清空文件列表（手动清空，用于特殊情况）
   */
  public clearFiles(): void {
    this.filePaths = [];
  }
}