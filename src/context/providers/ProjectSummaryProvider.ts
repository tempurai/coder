import * as fs from 'fs';
import * as path from 'path';
import { BaseContextProvider, ContextPriority } from '../ContextProvider';

/**
 * 项目摘要上下文提供者
 * 
 * 提供项目结构、基本信息和文件树的上下文信息。
 * 这是从 WorkspaceScanner 重构而来的上下文提供者实现。
 */
export class ProjectSummaryProvider extends BaseContextProvider {
  private readonly projectRoot: string;

  /**
   * 需要忽略的目录和文件
   */
  private readonly ignoredItems = new Set([
    'node_modules',
    '.git',
    '.vscode',
    '.idea',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.cache',
    'tmp',
    'temp',
    '.env.local',
    '.env.development',
    '.env.production',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '*.tmp'
  ]);

  /**
   * 需要忽略的文件扩展名
   */
  private readonly ignoredExtensions = new Set([
    '.log',
    '.tmp',
    '.cache',
    '.lock',
    '.pid'
  ]);

  /**
   * 构造函数
   * 
   * @param projectRoot 项目根目录路径，默认为当前工作目录
   * @param maxContextLength 最大上下文长度，默认为 8000 字符
   */
  constructor(projectRoot: string = process.cwd(), maxContextLength: number = 8000) {
    super(
      'project-summary',
      '提供项目结构、基本信息和重要文件的摘要',
      ContextPriority.CRITICAL,
      maxContextLength
    );
    this.projectRoot = projectRoot;
  }

  /**
   * 获取项目结构摘要上下文
   */
  async getContext(): Promise<string | null> {
    try {
      const basicInfo = this.getProjectBasicInfo();
      const structure = this.scanDirectory(this.projectRoot);
      
      const summary = `
=== 项目结构摘要 ===

${basicInfo}

文件结构:
${structure.join('\n')}

=== 摘要说明 ===
- 已智能过滤掉 node_modules、.git、dist 等常见大型目录
- 仅显示重要的代码文件和配置文件
- 目录结构限制在 4 层深度以保持清晰
`.trim();

      return this.truncateContext(summary);
    } catch (error) {
      return `无法生成项目结构摘要: ${error instanceof Error ? error.message : '未知错误'}`;
    }
  }

  /**
   * 检查提供者是否启用
   * 只有当项目根目录存在且可读时才启用
   */
  async isEnabled(): Promise<boolean> {
    try {
      const stats = fs.statSync(this.projectRoot);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 检查文件或目录是否应该被忽略
   */
  private shouldIgnore(itemName: string): boolean {
    // 检查是否在忽略列表中
    if (this.ignoredItems.has(itemName)) {
      return true;
    }

    // 检查文件扩展名
    const ext = path.extname(itemName);
    if (this.ignoredExtensions.has(ext)) {
      return true;
    }

    // 忽略隐藏文件（除了 .gitignore 等重要文件）
    if (itemName.startsWith('.') && !['gitignore', 'env.example'].some(important => itemName.includes(important))) {
      return true;
    }

    return false;
  }

  /**
   * 递归扫描目录结构
   */
  private scanDirectory(dirPath: string, currentDepth: number = 0, maxDepth: number = 4): string[] {
    const result: string[] = [];
    
    // 防止扫描过深
    if (currentDepth > maxDepth) {
      return result;
    }

    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      
      // 分离目录和文件，目录在前
      const directories = items.filter(item => item.isDirectory() && !this.shouldIgnore(item.name));
      const files = items.filter(item => item.isFile() && !this.shouldIgnore(item.name));

      // 添加目录
      for (const dir of directories) {
        const indent = '  '.repeat(currentDepth);
        result.push(`${indent}${dir.name}/`);
        
        // 递归扫描子目录
        const subDirPath = path.join(dirPath, dir.name);
        const subResults = this.scanDirectory(subDirPath, currentDepth + 1, maxDepth);
        result.push(...subResults);
      }

      // 添加文件（只显示重要文件）
      const importantFiles = files.filter(file => this.isImportantFile(file.name));
      for (const file of importantFiles) {
        const indent = '  '.repeat(currentDepth);
        result.push(`${indent}${file.name}`);
      }

    } catch (error) {
      // 如果无法读取目录，跳过
      const indent = '  '.repeat(currentDepth);
      result.push(`${indent}[Cannot read directory: ${path.basename(dirPath)}]`);
    }

    return result;
  }

  /**
   * 判断文件是否重要（需要在结构摘要中显示）
   */
  private isImportantFile(fileName: string): boolean {
    const importantFiles = [
      'package.json',
      'tsconfig.json',
      'README.md',
      '.gitignore',
      '.env.example',
      'Dockerfile',
      'docker-compose.yml',
      'webpack.config.js',
      'vite.config.js',
      'rollup.config.js',
      'jest.config.js',
      'babel.config.js',
      '.eslintrc.js',
      '.eslintrc.json',
      'prettier.config.js',
      'tailwind.config.js'
    ];

    const importantExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.java',
      '.cpp',
      '.c',
      '.rs',
      '.go',
      '.php',
      '.rb',
      '.sh',
      '.sql',
      '.graphql',
      '.yaml',
      '.yml'
    ];

    // 检查是否是重要的配置文件
    if (importantFiles.includes(fileName)) {
      return true;
    }

    // 检查是否是重要的代码文件
    const ext = path.extname(fileName);
    return importantExtensions.includes(ext);
  }

  /**
   * 获取项目基本信息
   */
  private getProjectBasicInfo(): string {
    const info: string[] = [];
    
    try {
      // 检查 package.json
      const packageJsonPath = path.join(this.projectRoot, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        info.push(`项目名称: ${packageJson.name || 'Unknown'}`);
        info.push(`项目描述: ${packageJson.description || 'No description'}`);
        
        // 主要依赖
        if (packageJson.dependencies) {
          const mainDeps = Object.keys(packageJson.dependencies).slice(0, 5);
          info.push(`主要依赖: ${mainDeps.join(', ')}`);
        }
      }

      // 检查是否是特定类型的项目
      const projectTypes: string[] = [];
      if (fs.existsSync(path.join(this.projectRoot, 'tsconfig.json'))) {
        projectTypes.push('TypeScript');
      }
      if (fs.existsSync(path.join(this.projectRoot, 'package.json'))) {
        projectTypes.push('Node.js');
      }
      if (fs.existsSync(path.join(this.projectRoot, 'requirements.txt')) || 
          fs.existsSync(path.join(this.projectRoot, 'setup.py'))) {
        projectTypes.push('Python');
      }
      
      if (projectTypes.length > 0) {
        info.push(`项目类型: ${projectTypes.join(', ')}`);
      }

    } catch (error) {
      info.push('无法读取项目基本信息');
    }

    return info.join('\n');
  }
}