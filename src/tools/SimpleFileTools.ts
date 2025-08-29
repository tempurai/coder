import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

/**
 * 简单文件写入工具
 * 在Git工作流模式下，直接写入文件而不需要复杂的备份和diff机制
 */
export const writeFileTool = {
    id: 'write_file',
    name: 'Write File Tool',
    description: `Write content to a file or overwrite an existing file.
    
    This operation is direct and atomic. All changes should be made on a task branch.
    The Git workflow handles versioning, backups, and rollbacks automatically.
    
    IMPORTANT: Always use this tool within a Git task branch created by start_task.`,
    
    parameters: z.object({
        filePath: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file')
    }),
    
    execute: async ({ filePath, content }: {
        filePath: string;
        content: string;
    }) => {
        console.log(`📝 Writing to file: ${filePath}`);
        
        try {
            // 解析为绝对路径
            const absolutePath = path.resolve(filePath);
            
            // 创建目录（如果需要）
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                console.log(`📁 Creating directory: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // 直接写入文件
            await fs.promises.writeFile(absolutePath, content, 'utf-8');
            
            console.log(`✅ File written successfully: ${filePath}`);
            console.log(`📊 Size: ${content.length} characters`);
            
            return {
                success: true,
                filePath: absolutePath,
                size: content.length,
                message: `File '${filePath}' written successfully`
            };
            
        } catch (error) {
            console.error(`❌ Failed to write file: ${error}`);
            return {
                success: false,
                filePath,
                error: `Write failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
};

/**
 * 文件修改工具 - 基于diff内容
 * 读取现有文件，应用修改，然后写回
 */
export const amendFileTool = {
    id: 'amend_file',
    name: 'Amend File Tool',
    description: `Apply targeted modifications to an existing file.
    
    This tool reads the existing file, applies the specified changes, and writes
    the updated content back. It's designed for making focused edits while
    preserving the rest of the file content.
    
    IMPORTANT: Always use this tool within a Git task branch created by start_task.`,
    
    parameters: z.object({
        filePath: z.string().describe('Path to the file to modify'),
        searchText: z.string().describe('Text to search for in the file'),
        replaceText: z.string().describe('Text to replace the search text with'),
        description: z.string().optional().describe('Description of the change being made')
    }),
    
    execute: async ({ filePath, searchText, replaceText, description }: {
        filePath: string;
        searchText: string;
        replaceText: string;
        description?: string;
    }) => {
        console.log(`🔧 Amending file: ${filePath}`);
        console.log(`🔍 Search: "${searchText}"`);
        console.log(`🔄 Replace: "${replaceText}"`);
        if (description) {
            console.log(`📝 Description: ${description}`);
        }
        
        try {
            // 读取现有文件
            const absolutePath = path.resolve(filePath);
            
            if (!fs.existsSync(absolutePath)) {
                return {
                    success: false,
                    filePath,
                    error: `File not found: ${filePath}`
                };
            }
            
            const originalContent = await fs.promises.readFile(absolutePath, 'utf-8');
            
            // 检查搜索文本是否存在
            if (!originalContent.includes(searchText)) {
                return {
                    success: false,
                    filePath,
                    error: `Search text not found in file: "${searchText}"`
                };
            }
            
            // 应用替换
            const updatedContent = originalContent.replace(searchText, replaceText);
            
            // 写回文件
            await fs.promises.writeFile(absolutePath, updatedContent, 'utf-8');
            
            console.log(`✅ File amended successfully: ${filePath}`);
            console.log(`📊 Changed from ${originalContent.length} to ${updatedContent.length} characters`);
            
            return {
                success: true,
                filePath: absolutePath,
                originalSize: originalContent.length,
                updatedSize: updatedContent.length,
                description: description || `Replaced "${searchText}" with "${replaceText}"`,
                message: `File '${filePath}' amended successfully`
            };
            
        } catch (error) {
            console.error(`❌ Failed to amend file: ${error}`);
            return {
                success: false,
                filePath,
                error: `Amend failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
};

/**
 * 读取文件工具
 * 简单的文件读取功能
 */
export const readFileTool = {
    id: 'read_file',
    name: 'Read File Tool',
    description: 'Read the contents of a file and return as text',
    
    parameters: z.object({
        filePath: z.string().describe('Path to the file to read'),
        encoding: z.string().default('utf-8').describe('File encoding (default: utf-8)')
    }),
    
    execute: async ({ filePath, encoding }: {
        filePath: string;
        encoding: string;
    }) => {
        console.log(`📖 Reading file: ${filePath}`);
        
        try {
            const absolutePath = path.resolve(filePath);
            
            if (!fs.existsSync(absolutePath)) {
                return {
                    success: false,
                    filePath,
                    error: `File not found: ${filePath}`
                };
            }
            
            const content = await fs.promises.readFile(absolutePath, encoding as BufferEncoding);
            const stats = await fs.promises.stat(absolutePath);
            
            console.log(`✅ File read successfully: ${filePath}`);
            console.log(`📊 Size: ${content.length} characters`);
            
            return {
                success: true,
                filePath: absolutePath,
                content,
                size: content.length,
                lastModified: stats.mtime.toISOString(),
                message: `File '${filePath}' read successfully`
            };
            
        } catch (error) {
            console.error(`❌ Failed to read file: ${error}`);
            return {
                success: false,
                filePath,
                error: `Read failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
};

/**
 * 文件操作工具集合
 * 专为Git工作流设计的简化文件工具
 */
export const simpleFileTools = {
    write_file: writeFileTool,
    amend_file: amendFileTool,
    read_file: readFileTool
};