import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * 智能输入预处理器
 * 
 * 从用户输入中智能提取文件路径，不仅依赖正则表达式，
 * 还会验证提取的路径是否对应真实存在的文件。
 */

/**
 * 文件路径验证结果
 */
interface FilePathValidationResult {
  path: string;
  exists: boolean;
  isFile: boolean;
  resolvedPath?: string;
}

/**
 * 从用户输入中提取可能的文件路径
 * 
 * @param input 用户输入字符串
 * @returns Promise<string[]> 验证存在的文件路径列表
 */
export async function extractFilePaths(input: string): Promise<string[]> {
  // 第一步：使用多种策略提取候选路径
  const candidatePaths = extractCandidatePaths(input);
  
  // 第二步：验证候选路径是否为真实文件
  const validatedPaths = await validateFilePaths(candidatePaths);
  
  // 第三步：使用智能搜索补充遗漏的文件
  const searchedPaths = await intelligentFileSearch(input, validatedPaths);
  
  // 合并结果并去重
  const allValidPaths = [...validatedPaths, ...searchedPaths];
  return [...new Set(allValidPaths)];
}

/**
 * 使用多种策略提取候选文件路径
 */
function extractCandidatePaths(input: string): string[] {
  const candidates = new Set<string>();
  
  // 策略1：标准文件路径模式（包含扩展名）
  const filePathPattern = /(?:^|\s|[\"`']?)([a-zA-Z0-9._/-]+\.[a-zA-Z0-9]+)(?:[\"`']?|\s|$)/g;
  let match;
  while ((match = filePathPattern.exec(input)) !== null) {
    candidates.add(match[1]);
  }
  
  // 策略2：相对路径（./或../开头）
  const relativePathPattern = /(?:^|\s)((?:\.\.?\/)+[a-zA-Z0-9._/-]+)/g;
  while ((match = relativePathPattern.exec(input)) !== null) {
    candidates.add(match[1]);
  }
  
  // 策略3：src/ 等常见目录开头的路径
  const commonDirPattern = /(?:^|\s)((?:src|lib|dist|build|test|tests|docs|app|components|utils|services|config)\/[a-zA-Z0-9._/-]+)/g;
  while ((match = commonDirPattern.exec(input)) !== null) {
    candidates.add(match[1]);
  }
  
  // 策略4：引号包围的路径
  const quotedPathPattern = /["`']([a-zA-Z0-9._/-]+(?:\.[a-zA-Z0-9]+)?)["`']/g;
  while ((match = quotedPathPattern.exec(input)) !== null) {
    candidates.add(match[1]);
  }
  
  // 策略5：package.json, tsconfig.json等常见配置文件
  const configFilePattern = /\b(package\.json|tsconfig\.json|webpack\.config\.[jt]s|vite\.config\.[jt]s|\.env(?:\.[a-zA-Z]+)?|README\.md|\.gitignore)\b/g;
  while ((match = configFilePattern.exec(input)) !== null) {
    candidates.add(match[1]);
  }
  
  return Array.from(candidates);
}

/**
 * 验证候选路径是否为真实存在的文件
 */
async function validateFilePaths(candidatePaths: string[]): Promise<string[]> {
  const validPaths: string[] = [];
  
  for (const candidatePath of candidatePaths) {
    const validation = await validateSingleFilePath(candidatePath);
    if (validation.exists && validation.isFile && validation.resolvedPath) {
      validPaths.push(validation.resolvedPath);
    }
  }
  
  return validPaths;
}

/**
 * 验证单个文件路径
 */
async function validateSingleFilePath(filePath: string): Promise<FilePathValidationResult> {
  try {
    // 尝试解析为绝对路径
    const resolvedPath = path.resolve(filePath);
    
    // 检查文件是否存在
    if (!fs.existsSync(resolvedPath)) {
      return { path: filePath, exists: false, isFile: false };
    }
    
    // 检查是否为文件
    const stats = fs.statSync(resolvedPath);
    const isFile = stats.isFile();
    
    return {
      path: filePath,
      exists: true,
      isFile,
      resolvedPath: isFile ? filePath : undefined // 返回原始路径，保持相对路径格式
    };
    
  } catch (error) {
    return { path: filePath, exists: false, isFile: false };
  }
}

/**
 * 使用智能搜索查找可能被遗漏的文件
 * 基于用户输入中的关键词进行文件搜索
 */
async function intelligentFileSearch(input: string, alreadyFoundPaths: string[]): Promise<string[]> {
  const searchResults: string[] = [];
  
  // 提取可能的文件名关键词
  const keywords = extractFileNameKeywords(input);
  
  for (const keyword of keywords) {
    try {
      // 使用find命令搜索相关文件
      const foundPaths = await searchFilesByKeyword(keyword);
      
      // 过滤掉已经找到的路径
      const newPaths = foundPaths.filter(p => !alreadyFoundPaths.includes(p));
      searchResults.push(...newPaths);
      
    } catch (error) {
      // 搜索失败时忽略错误，继续处理其他关键词
      continue;
    }
  }
  
  return searchResults;
}

/**
 * 从输入中提取可能的文件名关键词
 */
function extractFileNameKeywords(input: string): string[] {
  const keywords = new Set<string>();
  
  // 提取可能的类名、函数名等作为文件名线索
  const identifierPattern = /\b([A-Z][a-zA-Z0-9]*(?:Component|Service|Provider|Manager|Handler|Utils?|Helper)?)\b/g;
  let match;
  while ((match = identifierPattern.exec(input)) !== null) {
    keywords.add(match[1]);
  }
  
  // 提取可能的模块名
  const modulePattern = /\b([a-z][a-zA-Z0-9]*(?:module|config|setup|index)?)\b/g;
  while ((match = modulePattern.exec(input)) !== null) {
    if (match[1].length > 3) { // 忽略过短的词
      keywords.add(match[1]);
    }
  }
  
  return Array.from(keywords).slice(0, 5); // 限制关键词数量，避免过多搜索
}

/**
 * 使用find命令按关键词搜索文件
 */
async function searchFilesByKeyword(keyword: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // 限制搜索深度和范围，避免性能问题
    const findCommand = spawn('find', [
      '.',
      '-maxdepth', '4',
      '-type', 'f',
      '(',
      '-name', `*${keyword}*`,
      '-o', '-name', `${keyword}.*`,
      '-o', '-name', `*${keyword.toLowerCase()}*`,
      ')',
      '!', '-path', '*/node_modules/*',
      '!', '-path', '*/.git/*',
      '!', '-path', '*/dist/*',
      '!', '-path', '*/build/*'
    ]);
    
    let stdout = '';
    let stderr = '';
    
    findCommand.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    findCommand.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    findCommand.on('close', (code) => {
      if (code === 0) {
        // 处理搜索结果
        const paths = stdout
          .trim()
          .split('\n')
          .filter(line => line.length > 0)
          .map(line => line.replace(/^\.\//, '')) // 移除 ./ 前缀
          .filter(line => isLikelySourceFile(line)) // 只保留可能的源码文件
          .slice(0, 3); // 限制结果数量
        
        resolve(paths);
      } else {
        reject(new Error(`find command failed with code ${code}: ${stderr}`));
      }
    });
    
    // 设置超时，避免搜索时间过长
    setTimeout(() => {
      findCommand.kill();
      reject(new Error('Search timeout'));
    }, 2000); // 2秒超时
  });
}

/**
 * 判断文件是否像是源码文件
 */
function isLikelySourceFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  const sourceExtensions = [
    '.ts', '.tsx', '.js', '.jsx',
    '.py', '.java', '.cpp', '.c', '.h',
    '.rs', '.go', '.php', '.rb',
    '.vue', '.svelte',
    '.json', '.yaml', '.yml',
    '.md', '.txt'
  ];
  
  return sourceExtensions.includes(ext);
}

/**
 * 获取预处理器的统计信息（用于调试）
 */
export interface PreprocessorStats {
  candidatesFound: number;
  validatedFiles: number;
  searchResults: number;
  totalProcessingTime: number;
}

/**
 * 带统计信息的文件路径提取函数
 */
export async function extractFilePathsWithStats(input: string): Promise<{
  paths: string[];
  stats: PreprocessorStats;
}> {
  const startTime = Date.now();
  
  const candidatePaths = extractCandidatePaths(input);
  const validatedPaths = await validateFilePaths(candidatePaths);
  const searchedPaths = await intelligentFileSearch(input, validatedPaths);
  
  const allValidPaths = [...new Set([...validatedPaths, ...searchedPaths])];
  const processingTime = Date.now() - startTime;
  
  return {
    paths: allValidPaths,
    stats: {
      candidatesFound: candidatePaths.length,
      validatedFiles: validatedPaths.length,
      searchResults: searchedPaths.length,
      totalProcessingTime: processingTime
    }
  };
}