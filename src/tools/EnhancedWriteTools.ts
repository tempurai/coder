import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import { exec } from 'child_process';
import * as util from 'util';
import { ToolParameterCorrector } from './ToolParameterCorrector';
import type { LanguageModel } from 'ai';

const execAsync = util.promisify(exec);

// 文件操作类型定义
export interface FileOperation {
    type: 'diff' | 'direct';
    filePath: string;
    content: string;
    originalContent?: string;
    diff?: string;
    additions?: number;
    deletions?: number;
    preview: boolean;
    showFullContent: boolean;
}

export interface PreviewResult {
    type: 'preview';
    operation: FileOperation;
    needsConfirmation: boolean;
    formattedPreview: string;
}

export interface WriteResult {
    type: 'write';
    success: boolean;
    filePath: string;
    backupPath?: string;
    error?: string;
}

// 增强的写入工具 - 支持预览和双模式
export const enhancedWriteTool = {
    id: 'enhanced_write',
    name: 'Enhanced Write Tool',
    description: `Enhanced file writing with preview and confirmation.
    
    Features:
    - Preview mode: Shows changes before applying
    - Diff mode: For targeted changes to existing files
    - Direct mode: For new files or complete replacements
    - Full content preview option
    - User confirmation workflow
    
    ALWAYS use preview=true first to show user what will change!`,
    parameters: z.object({
        filePath: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file'),
        mode: z.enum(['diff', 'direct']).default('diff').describe('Write mode: diff for changes, direct for full replacement'),
        preview: z.boolean().default(true).describe('Show preview before writing (ALWAYS use true first)'),
        showFullContent: z.boolean().default(false).describe('Show complete file content after changes'),
        createBackup: z.boolean().default(true).describe('Create backup before modifying existing files'),
    }),
    execute: async ({ filePath, content, mode, preview, showFullContent, createBackup }: {
        filePath: string;
        content: string;
        mode: 'diff' | 'direct';
        preview: boolean;
        showFullContent: boolean;
        createBackup: boolean;
    }) => {
        console.log(`📝 Enhanced Write Tool - ${mode} mode`);
        console.log(`📄 File: ${filePath}`);
        console.log(`🔍 Preview: ${preview}`);
        
        try {
            if (preview) {
                // 预览模式 - 不实际修改文件
                const operation = await generateFileOperation(filePath, content, mode, showFullContent);
                const formattedPreview = await formatPreviewForTerminal(operation);
                
                return {
                    type: 'preview',
                    operation,
                    needsConfirmation: true,
                    formattedPreview,
                    instructions: 'Review the changes above. Use enhanced_write with preview=false to apply, or modify your request.'
                } as PreviewResult;
            } else {
                // 实际写入模式
                const result = await executeWrite(filePath, content, mode, createBackup);
                return result;
            }
        } catch (error) {
            return {
                type: 'write',
                success: false,
                filePath,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            } as WriteResult;
        }
    },
};

// 预览专用工具 - 用于重新生成预览
export const previewChangesTool = {
    id: 'preview_changes',
    name: 'Preview Changes',
    description: 'Preview file changes without applying them. Use this to show users what will change.',
    parameters: z.object({
        filePath: z.string().describe('Path to the file'),
        newContent: z.string().describe('New content for the file'),
        mode: z.enum(['diff', 'direct']).default('diff').describe('Preview mode'),
        showFullContent: z.boolean().default(false).describe('Show complete file after changes'),
        contextLines: z.number().default(3).describe('Number of context lines in diff view'),
    }),
    execute: async ({ filePath, newContent, mode, showFullContent, contextLines }: {
        filePath: string;
        newContent: string;
        mode: 'diff' | 'direct';
        showFullContent: boolean;
        contextLines: number;
    }) => {
        try {
            const operation = await generateFileOperation(filePath, newContent, mode, showFullContent, contextLines);
            const formattedPreview = await formatPreviewForTerminal(operation);
            
            return {
                success: true,
                preview: formattedPreview,
                operation,
                stats: {
                    mode: operation.type,
                    exists: !!operation.originalContent,
                    additions: operation.additions || 0,
                    deletions: operation.deletions || 0,
                    totalLines: newContent.split('\n').length
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate preview'
            };
        }
    }
};

// 辅助函数：生成文件操作对象
async function generateFileOperation(
    filePath: string, 
    newContent: string, 
    mode: 'diff' | 'direct', 
    showFullContent: boolean,
    contextLines: number = 3
): Promise<FileOperation> {
    let originalContent = '';
    let fileExists = false;
    
    // 检查文件是否存在
    try {
        originalContent = await fs.promises.readFile(filePath, 'utf8');
        fileExists = true;
    } catch (error) {
        // 文件不存在，使用空内容
        originalContent = '';
        fileExists = false;
    }
    
    const operation: FileOperation = {
        type: mode,
        filePath,
        content: newContent,
        originalContent,
        preview: true,
        showFullContent
    };
    
    if (mode === 'diff' && fileExists) {
        // 生成diff
        const diffResult = await generateDiff(originalContent, newContent, contextLines);
        operation.diff = diffResult.diff;
        operation.additions = diffResult.additions;
        operation.deletions = diffResult.deletions;
    } else {
        // 直接模式或新文件
        operation.type = 'direct';
        operation.additions = newContent.split('\n').length;
        operation.deletions = fileExists ? originalContent.split('\n').length : 0;
    }
    
    return operation;
}

// 辅助函数：生成diff
async function generateDiff(original: string, newContent: string, contextLines: number = 3) {
    try {
        const tempOriginal = path.join(os.tmpdir(), `original_${Date.now()}.tmp`);
        const tempNew = path.join(os.tmpdir(), `new_${Date.now()}.tmp`);
        
        await fs.promises.writeFile(tempOriginal, original);
        await fs.promises.writeFile(tempNew, newContent);
        
        try {
            const { stdout } = await execAsync(`diff -u -U ${contextLines} "${tempOriginal}" "${tempNew}"`);
            const diff = stdout;
            const stats = analyzeDiff(diff);
            
            await fs.promises.unlink(tempOriginal);
            await fs.promises.unlink(tempNew);
            
            return { diff, ...stats };
        } catch (error: any) {
            // diff returns non-zero when files differ, but that's expected
            const diff = error.stdout || '';
            const stats = analyzeDiff(diff);
            
            await fs.promises.unlink(tempOriginal);
            await fs.promises.unlink(tempNew);
            
            return { diff, ...stats };
        }
    } catch (error) {
        return { 
            diff: 'Failed to generate diff', 
            additions: newContent.split('\n').length,
            deletions: original.split('\n').length 
        };
    }
}

// 辅助函数：分析diff统计信息
function analyzeDiff(diff: string): { additions: number; deletions: number } {
    const lines = diff.split('\n');
    let additions = 0;
    let deletions = 0;
    
    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
        }
    }
    
    return { additions, deletions };
}

// 辅助函数：格式化预览显示
async function formatPreviewForTerminal(operation: FileOperation): Promise<string> {
    const lines = [];
    const fileExists = !!operation.originalContent;
    
    // 头部信息
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📄 File: ${operation.filePath}`);
    lines.push(`🔧 Mode: ${operation.type} ${fileExists ? '(modify existing)' : '(create new)'}`);
    
    if (operation.additions !== undefined || operation.deletions !== undefined) {
        lines.push(`📊 Changes: +${operation.additions || 0} -${operation.deletions || 0} lines`);
    }
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // 显示diff或内容
    if (operation.type === 'diff' && operation.diff) {
        lines.push('🔍 Changes preview:');
        lines.push('');
        lines.push(formatDiffForTerminal(operation.diff));
    } else {
        lines.push('📝 Complete file content:');
        lines.push('');
        lines.push(formatCodeForTerminal(operation.content));
    }
    
    // 显示完整内容选项
    if (operation.showFullContent && operation.type === 'diff') {
        lines.push('');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('📖 Complete file after changes:');
        lines.push('');
        lines.push(formatCodeForTerminal(operation.content));
    }
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return lines.join('\n');
}

// 辅助函数：格式化diff显示
function formatDiffForTerminal(diff: string): string {
    return diff
        .split('\n')
        .map(line => {
            if (line.startsWith('+++') || line.startsWith('---')) {
                return `\x1b[1m\x1b[37m${line}\x1b[0m`; // Bold white
            } else if (line.startsWith('+')) {
                return `\x1b[32m${line}\x1b[0m`; // Green
            } else if (line.startsWith('-')) {
                return `\x1b[31m${line}\x1b[0m`; // Red  
            } else if (line.startsWith('@@')) {
                return `\x1b[36m\x1b[1m${line}\x1b[0m`; // Bold cyan
            } else {
                return `\x1b[37m${line}\x1b[0m`; // White/default
            }
        })
        .join('\n');
}

// 辅助函数：格式化代码显示
function formatCodeForTerminal(code: string): string {
    return code
        .split('\n')
        .map((line, index) => {
            const lineNum = (index + 1).toString().padStart(3, ' ');
            return `\x1b[90m${lineNum}|\x1b[0m ${line}`;
        })
        .join('\n');
}

// 辅助函数：执行实际写入
async function executeWrite(filePath: string, content: string, mode: 'diff' | 'direct', createBackup: boolean): Promise<WriteResult> {
    let backupPath = '';
    
    try {
        // 创建目录（如果需要）
        const dir = path.dirname(filePath);
        await fs.promises.mkdir(dir, { recursive: true });
        
        // 创建备份（如果文件存在且需要备份）
        if (createBackup) {
            try {
                await fs.promises.access(filePath);
                backupPath = `${filePath}.backup.${Date.now()}`;
                await fs.promises.copyFile(filePath, backupPath);
                console.log(`💾 Backup created: ${backupPath}`);
            } catch (error) {
                // 文件不存在，不需要备份
            }
        }
        
        // 写入文件
        await fs.promises.writeFile(filePath, content);
        
        console.log(`✅ Successfully wrote to: ${filePath}`);
        console.log(`📊 Content length: ${content.length} characters`);
        console.log(`📝 Lines: ${content.split('\n').length}`);
        
        return {
            type: 'write',
            success: true,
            filePath,
            backupPath: backupPath || undefined
        };
    } catch (error) {
        return {
            type: 'write',
            success: false,
            filePath,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * 智能字符串替换工具
 * 具有参数修正能力，能自动修正常见的空格、转义符等错误
 */
export const smartStringReplaceTool = {
    id: 'smart_string_replace',
    name: 'Smart String Replace',
    description: `Intelligently replace text in files with automatic parameter correction.
    
    Features:
    - Automatic correction of whitespace, escape characters, quotes
    - Fuzzy matching for slightly incorrect old_string values
    - Preview mode to show changes before applying
    - Backup creation for safety
    
    Use this when enhanced_write diff mode fails due to parameter mismatches.`,
    parameters: z.object({
        filePath: z.string().describe('Path to the file to modify'),
        oldString: z.string().describe('Text to find and replace'),
        newString: z.string().describe('Text to replace with'),
        preview: z.boolean().default(true).describe('Show preview before applying changes'),
        createBackup: z.boolean().default(true).describe('Create backup before modifying'),
        enableCorrection: z.boolean().default(true).describe('Enable automatic parameter correction'),
        model: z.any().optional().describe('Language model for parameter correction (injected by agent)')
    }),
    execute: async ({ 
        filePath, 
        oldString, 
        newString, 
        preview, 
        createBackup, 
        enableCorrection,
        model
    }: {
        filePath: string;
        oldString: string;
        newString: string;
        preview: boolean;
        createBackup: boolean;
        enableCorrection: boolean;
        model?: LanguageModel;
    }) => {
        console.log(`🎯 Smart String Replace in: ${filePath}`);
        console.log(`🔍 Searching for: "${oldString}"`);
        console.log(`🔄 Replacing with: "${newString}"`);
        
        try {
            // 读取文件内容
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            let finalOldString = oldString;
            let correctionUsed = false;

            // 检查原字符串是否存在
            if (!fileContent.includes(oldString)) {
                console.log('⚠️ Original string not found in file');
                
                if (enableCorrection && model) {
                    console.log('🔧 Attempting parameter correction...');
                    
                    const corrector = new ToolParameterCorrector();
                    const correctionResult = await corrector.correctStringParameter(
                        oldString,
                        fileContent,
                        model,
                        { verbose: true }
                    );
                    
                    if (correctionResult.corrected) {
                        finalOldString = correctionResult.correctedValue!;
                        correctionUsed = true;
                        console.log(`✅ Parameter corrected: "${finalOldString}"`);
                        console.log(`📝 Explanation: ${correctionResult.explanation}`);
                    } else {
                        return {
                            success: false,
                            error: `String not found in file and correction failed: ${correctionResult.explanation}`,
                            filePath,
                            originalString: oldString
                        };
                    }
                } else {
                    return {
                        success: false,
                        error: 'String not found in file and correction is disabled',
                        filePath,
                        originalString: oldString,
                        suggestion: 'Enable parameter correction or verify the exact string content'
                    };
                }
            }

            // 执行替换
            const newContent = fileContent.replace(finalOldString, newString);
            
            if (newContent === fileContent) {
                return {
                    success: false,
                    error: 'No changes were made (string might not exist or replacement is identical)',
                    filePath
                };
            }

            const operation: FileOperation = {
                type: 'direct',
                filePath,
                content: newContent,
                originalContent: fileContent,
                preview,
                showFullContent: false,
                // 计算统计信息
                additions: (newString.match(/\n/g) || []).length - (finalOldString.match(/\n/g) || []).length,
                deletions: 0
            };

            if (preview) {
                // 预览模式 - 显示将要进行的替换
                const previewText = generateReplacePreview(
                    fileContent, 
                    finalOldString, 
                    newString, 
                    correctionUsed
                );
                
                return {
                    type: 'preview',
                    success: true,
                    operation,
                    needsConfirmation: true,
                    formattedPreview: previewText,
                    correctionUsed,
                    originalString: correctionUsed ? oldString : undefined,
                    correctedString: correctionUsed ? finalOldString : undefined,
                    instructions: 'Review the replacement above. Use smart_string_replace with preview=false to apply.'
                };
            } else {
                // 实际替换
                const writeResult = await executeStringReplace(
                    filePath, 
                    newContent, 
                    createBackup,
                    finalOldString,
                    newString
                );
                
                return {
                    ...writeResult,
                    correctionUsed,
                    originalString: correctionUsed ? oldString : undefined,
                    correctedString: correctionUsed ? finalOldString : undefined
                };
            }
            
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                filePath
            };
        }
    }
};

/**
 * 生成字符串替换的预览
 */
function generateReplacePreview(
    content: string, 
    oldStr: string, 
    newStr: string, 
    correctionUsed: boolean
): string {
    const lines = content.split('\n');
    const oldLines = oldStr.split('\n');
    const newLines = newStr.split('\n');
    
    // 找到替换位置
    let matchStartLine = -1;
    for (let i = 0; i <= lines.length - oldLines.length; i++) {
        if (oldLines.every((oldLine, idx) => lines[i + idx] === oldLine)) {
            matchStartLine = i;
            break;
        }
    }
    
    if (matchStartLine === -1) {
        // 如果是单行替换
        const matchLine = lines.findIndex(line => line.includes(oldStr));
        if (matchLine !== -1) {
            const contextStart = Math.max(0, matchLine - 3);
            const contextEnd = Math.min(lines.length, matchLine + 4);
            
            let preview = '📝 String Replacement Preview:\n\n';
            if (correctionUsed) {
                preview += '🔧 Parameter correction was applied\n\n';
            }
            
            for (let i = contextStart; i < contextEnd; i++) {
                const lineNum = i + 1;
                if (i === matchLine) {
                    const oldLine = lines[i];
                    const newLine = oldLine.replace(oldStr, newStr);
                    preview += `\x1b[90m${lineNum.toString().padStart(3, ' ')}|\x1b[0m \x1b[91m- ${oldLine}\x1b[0m\n`;
                    preview += `\x1b[90m${lineNum.toString().padStart(3, ' ')}|\x1b[0m \x1b[92m+ ${newLine}\x1b[0m\n`;
                } else {
                    preview += `\x1b[90m${lineNum.toString().padStart(3, ' ')}|\x1b[0m   ${lines[i]}\n`;
                }
            }
            return preview;
        }
    } else {
        // 多行替换
        const contextStart = Math.max(0, matchStartLine - 3);
        const contextEnd = Math.min(lines.length, matchStartLine + oldLines.length + 3);
        
        let preview = '📝 Multi-line String Replacement Preview:\n\n';
        if (correctionUsed) {
            preview += '🔧 Parameter correction was applied\n\n';
        }
        
        for (let i = contextStart; i < contextEnd; i++) {
            const lineNum = i + 1;
            if (i >= matchStartLine && i < matchStartLine + oldLines.length) {
                // 旧内容行
                preview += `\x1b[90m${lineNum.toString().padStart(3, ' ')}|\x1b[0m \x1b[91m- ${lines[i]}\x1b[0m\n`;
            } else if (i === matchStartLine + oldLines.length) {
                // 在这里插入新内容
                newLines.forEach((newLine, idx) => {
                    const newLineNum = matchStartLine + idx + 1;
                    preview += `\x1b[90m${newLineNum.toString().padStart(3, ' ')}|\x1b[0m \x1b[92m+ ${newLine}\x1b[0m\n`;
                });
                if (i < contextEnd) {
                    preview += `\x1b[90m${lineNum.toString().padStart(3, ' ')}|\x1b[0m   ${lines[i]}\n`;
                }
            } else {
                // 上下文行
                preview += `\x1b[90m${lineNum.toString().padStart(3, ' ')}|\x1b[0m   ${lines[i]}\n`;
            }
        }
        return preview;
    }
    
    return `Preview generation failed. Old string: "${oldStr}", New string: "${newStr}"`;
}

/**
 * 执行字符串替换写入
 */
async function executeStringReplace(
    filePath: string, 
    newContent: string, 
    createBackup: boolean,
    oldString: string,
    newString: string
): Promise<WriteResult> {
    let backupPath = '';
    
    try {
        // 创建备份
        if (createBackup) {
            backupPath = `${filePath}.backup.${Date.now()}`;
            await fs.promises.copyFile(filePath, backupPath);
            console.log(`💾 Backup created: ${backupPath}`);
        }
        
        // 写入新内容
        await fs.promises.writeFile(filePath, newContent);
        
        console.log(`✅ Successfully replaced text in: ${filePath}`);
        console.log(`📊 Replacement: "${oldString}" → "${newString}"`);
        
        return {
            type: 'write',
            success: true,
            filePath,
            backupPath: backupPath || undefined
        };
        
    } catch (error) {
        return {
            type: 'write',
            success: false,
            filePath,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// 导出工具配置
export const enhancedWriteTools = {
    enhanced_write: enhancedWriteTool,
    preview_changes: previewChangesTool,
    smart_string_replace: smartStringReplaceTool,
};