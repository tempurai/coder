import * as fs from 'fs';
import { z } from 'zod';
import { ErrorHandler } from '../errors/ErrorHandler';
import { ToolExecutionResult } from './index';

// Keep only essential file operations that can't be easily done via shell

export const readFileTool = {
    id: 'read_file',
    name: 'Read File',
    description: 'Read file contents. Use this to understand code before making changes.',
    parameters: z.object({
        filePath: z.string().describe('Path to the file to read'),
        startLine: z.number().optional().describe('Starting line number (1-based)'),
        endLine: z.number().optional().describe('Ending line number (1-based)'),
    }),
    execute: async ({ filePath, startLine, endLine }: {
        filePath: string;
        startLine?: number;
        endLine?: number;
    }): Promise<ToolExecutionResult<{ content: string; totalLines: number; selectedRange?: string; filePath: string }>> => {
        return ErrorHandler.wrapToolExecution(async () => {
            const content = await fs.promises.readFile(filePath, 'utf8');
            
            if (startLine !== undefined || endLine !== undefined) {
                const lines = content.split('\n');
                const start = Math.max(0, (startLine || 1) - 1);
                const end = Math.min(lines.length, endLine || lines.length);
                const selectedLines = lines.slice(start, end);
                
                return {
                    content: selectedLines.join('\n'),
                    totalLines: lines.length,
                    selectedRange: `${start + 1}-${end}`,
                    filePath
                };
            }
            
            return {
                content,
                totalLines: content.split('\n').length,
                filePath
            };
        }, 'read_file');
    },
};

export const writeFileTool = {
    id: 'write_file', 
    name: 'Write File',
    description: `Write content to a file. 
    
    ⚠️ WARNING: This REPLACES the entire file content. 
    Consider using smart_diff_apply for targeted changes instead.
    
    Use this only for:
    - Creating new files
    - Complete file replacements when diff is not appropriate
    - Small files where diff overhead is not worth it`,
    parameters: z.object({
        filePath: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file'),
        createDirs: z.boolean().default(true).describe('Whether to create parent directories if they don\'t exist'),
        backup: z.boolean().default(false).describe('Whether to create a backup before overwriting'),
    }),
    execute: async ({ filePath, content, createDirs, backup }: {
        filePath: string;
        content: string;
        createDirs: boolean;
        backup: boolean;
    }): Promise<ToolExecutionResult<{ filePath: string; contentLength: number; linesWritten: number; backupCreated: boolean; backupPath?: string }>> => {
        return ErrorHandler.wrapToolExecution(async () => {
            const path = await import('path');
            
            // Create directories if needed
            if (createDirs) {
                const dir = path.dirname(filePath);
                await fs.promises.mkdir(dir, { recursive: true });
            }
            
            // Create backup if requested and file exists
            let backupPath = '';
            if (backup) {
                try {
                    await fs.promises.access(filePath);
                    backupPath = `${filePath}.backup.${Date.now()}`;
                    await fs.promises.copyFile(filePath, backupPath);
                } catch (error) {
                    // File doesn't exist, no backup needed
                }
            }
            
            await fs.promises.writeFile(filePath, content);
            
            return {
                filePath,
                contentLength: content.length,
                linesWritten: content.split('\n').length,
                backupCreated: !!backupPath,
                backupPath: backupPath || undefined
            };
        }, 'write_file');
    },
};

export const projectContextTool = {
    id: 'project_context',
    name: 'Project Context',
    description: `Get intelligent project context and structure understanding.
    
    This tool analyzes:
    - Project type (React, Node.js, etc.)
    - Directory structure
    - Key configuration files
    - Coding conventions used
    - Main entry points`,
    parameters: z.object({
        depth: z.number().default(2).describe('Directory depth to analyze'),
        includeHidden: z.boolean().default(false).describe('Whether to include hidden files/directories'),
    }),
    execute: async ({ depth, includeHidden }: { depth: number; includeHidden: boolean }): Promise<ToolExecutionResult<any>> => {
        return ErrorHandler.wrapToolExecution(async () => {
            return await analyzeProjectContext(depth, includeHidden);
        }, 'project_context');
    },
};

export const codeSearchTool = {
    id: 'code_search',
    name: 'Code Search',
    description: `Smart code search with context awareness. Better than raw grep for code.
    
    Features:
    - Language-aware search
    - Function/class/interface detection
    - Import/export tracking
    - Context-aware results`,
    parameters: z.object({
        query: z.string().describe('Search query (can be function name, class name, or text)'),
        searchType: z.enum(['all', 'functions', 'classes', 'imports', 'exports', 'text']).default('all').describe('Type of search to perform'),
        filePattern: z.string().optional().describe('File pattern to search in (e.g., "*.ts", "src/**/*.js")'),
        maxResults: z.number().default(20).describe('Maximum number of results to return'),
    }),
    execute: async ({ query, searchType, filePattern, maxResults }: {
        query: string;
        searchType: string;
        filePattern?: string;
        maxResults: number;
    }): Promise<ToolExecutionResult<{ results: any[]; query: string; searchType: string; totalFound: number }>> => {
        return ErrorHandler.wrapToolExecution(async () => {
            const results = await performCodeSearch(query, searchType, filePattern, maxResults);
            return {
                results,
                query,
                searchType,
                totalFound: results.length
            };
        }, 'code_search');
    },
};

// Helper functions

async function analyzeProjectContext(depth: number, includeHidden: boolean) {
    const path = await import('path');
    const context: any = {
        projectType: 'unknown',
        structure: {},
        configFiles: [],
        conventions: {},
        entryPoints: [],
        packageInfo: null
    };
    
    try {
        // Check for package.json
        const packageJson = await fs.promises.readFile('./package.json', 'utf8');
        context.packageInfo = JSON.parse(packageJson);
        
        // Determine project type based on dependencies
        const deps = { ...context.packageInfo.dependencies, ...context.packageInfo.devDependencies };
        if (deps.react) context.projectType = 'react';
        else if (deps.vue) context.projectType = 'vue';
        else if (deps.express) context.projectType = 'express';
        else if (deps.next) context.projectType = 'nextjs';
        else if (deps.typescript) context.projectType = 'typescript';
        else context.projectType = 'node';
        
        // Find entry points
        if (context.packageInfo.main) context.entryPoints.push(context.packageInfo.main);
        if (context.packageInfo.scripts?.start) {
            const startScript = context.packageInfo.scripts.start;
            const match = startScript.match(/(\w+\.(?:js|ts|tsx))/);
            if (match) context.entryPoints.push(match[1]);
        }
        
    } catch (error) {
        // No package.json found
    }
    
    // Analyze directory structure
    context.structure = await analyzeDirectory('.', depth, includeHidden);
    
    // Find configuration files
    const configPatterns = [
        'tsconfig.json', '.eslintrc*', 'prettier.config.*', 
        'vite.config.*', 'webpack.config.*', '.env*'
    ];
    
    for (const pattern of configPatterns) {
        try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            const { stdout } = await execAsync(`find . -maxdepth 2 -name "${pattern}" -type f`);
            const files = stdout.trim().split('\n').filter(f => f.trim());
            context.configFiles.push(...files);
        } catch (error) {
            // Pattern not found
        }
    }
    
    // Analyze coding conventions
    context.conventions = await analyzeCodingConventions();
    
    return context;
}

async function analyzeDirectory(dir: string, depth: number, includeHidden: boolean): Promise<any> {
    if (depth <= 0) return {};
    
    const path = await import('path');
    const structure: any = {};
    
    try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (!includeHidden && entry.name.startsWith('.') && entry.name !== '.env') continue;
            if (['node_modules', 'dist', 'build'].includes(entry.name)) continue;
            
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                structure[entry.name] = await analyzeDirectory(fullPath, depth - 1, includeHidden);
            } else {
                structure[entry.name] = {
                    type: 'file',
                    extension: path.extname(entry.name),
                    size: (await fs.promises.stat(fullPath)).size
                };
            }
        }
    } catch (error) {
        // Directory not accessible
    }
    
    return structure;
}

async function analyzeCodingConventions(): Promise<any> {
    const conventions: any = {
        naming: 'unknown',
        fileExtensions: {},
        indentation: 'unknown'
    };
    
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        // Find TypeScript/JavaScript files to analyze
        const { stdout } = await execAsync('find . -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" | head -20');
        const files = stdout.trim().split('\n').filter(f => f.trim());
        
        if (files.length > 0) {
            // Analyze file extensions
            const extensions: any = {};
            files.forEach(file => {
                const path = require('path');
                const ext = path.extname(file);
                extensions[ext] = (extensions[ext] || 0) + 1;
            });
            conventions.fileExtensions = extensions;
            
            // Analyze naming convention from first few files
            const camelCase = files.filter(f => /[a-z][A-Z]/.test(require('path').basename(f))).length;
            const kebabCase = files.filter(f => /-/.test(require('path').basename(f))).length;
            const snakeCase = files.filter(f => /_/.test(require('path').basename(f))).length;
            
            if (kebabCase > camelCase && kebabCase > snakeCase) {
                conventions.naming = 'kebab-case';
            } else if (snakeCase > camelCase) {
                conventions.naming = 'snake_case';
            } else if (camelCase > 0) {
                conventions.naming = 'camelCase';
            }
        }
    } catch (error) {
        // Analysis failed
    }
    
    return conventions;
}

async function performCodeSearch(query: string, searchType: string, filePattern?: string, maxResults: number = 20): Promise<any[]> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const results: any[] = [];
    const includePattern = filePattern || '*.{ts,js,tsx,jsx}';
    
    try {
        let grepPattern = '';
        
        switch (searchType) {
            case 'functions':
                grepPattern = `(function\\s+${query}|const\\s+${query}\\s*=|${query}\\s*[:=]\\s*(async\\s*)?\\(|${query}\\(.*\\)\\s*=>)`;
                break;
            case 'classes':
                grepPattern = `class\\s+${query}`;
                break;
            case 'imports':
                grepPattern = `import.*${query}|from\\s+['"'].*${query}`;
                break;
            case 'exports':
                grepPattern = `export.*${query}`;
                break;
            case 'all':
                grepPattern = query;
                break;
            default:
                grepPattern = query;
        }
        
        const command = `grep -r -n --include="${includePattern}" -E "${grepPattern}" . | head -${maxResults}`;
        const { stdout } = await execAsync(command);
        
        if (stdout.trim()) {
            const lines = stdout.trim().split('\n');
            
            for (const line of lines) {
                const [filePath, lineNumber, ...contentParts] = line.split(':');
                const content = contentParts.join(':').trim();
                
                results.push({
                    file: filePath,
                    line: parseInt(lineNumber),
                    content,
                    match: query
                });
            }
        }
    } catch (error) {
        // Search failed or no results found
    }
    
    return results;
}