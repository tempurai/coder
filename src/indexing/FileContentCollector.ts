import * as path from 'path';
import * as fs from 'fs/promises';
import { encode } from 'gpt-tokenizer';
import { IndentLogger } from '../utils/IndentLogger.js';

export interface FileContent {
    path: string;
    content: string;
    tokens: number;
    language: string;
    truncated: boolean;
}

export class FileContentCollector {
    private readonly maxTokensPerFile = 4000;
    private readonly maxTotalTokens = 800000;

    constructor(private readonly projectRoot: string) { }

    async collect(importantPaths: string[]): Promise<FileContent[]> {
        const contents: FileContent[] = [];
        let totalTokens = 0;
        let processedFiles = 0;
        let skippedForTokenLimit = 0;
        let truncatedFiles = 0;
        let binaryOrLargeFiles = 0;
        let errorFiles = 0;

        for (const relativePath of importantPaths) {
            if (totalTokens >= this.maxTotalTokens) {
                skippedForTokenLimit = importantPaths.length - processedFiles;
                IndentLogger.log(`Token limit reached, skipping ${skippedForTokenLimit} remaining files`, 1);
                break;
            }

            const fullPath = path.join(this.projectRoot, relativePath);
            try {
                const fileReadResult = await this.readFileWithLimit(fullPath);
                if (!fileReadResult) {
                    binaryOrLargeFiles++;
                    continue;
                }

                const { content, truncated } = fileReadResult;
                const tokens = encode(content).length;
                const language = this.detectLanguage(relativePath);

                contents.push({ path: relativePath, content, tokens, language, truncated });
                totalTokens += tokens;
                processedFiles++;
                if (truncated) truncatedFiles++;

                // 每20个文件输出一次进度
                if (processedFiles % 20 === 0 && processedFiles < importantPaths.length) {
                    IndentLogger.log(`Processing files: ${processedFiles}/${importantPaths.length} (~${totalTokens} tokens)`, 1);
                }
            } catch (error) {
                errorFiles++;
                continue;
            }
        }

        // 简化的总结信息
        if (errorFiles > 0) {
            IndentLogger.log(`Skipped ${errorFiles} files due to read errors`, 1);
        }
        if (binaryOrLargeFiles > 0) {
            IndentLogger.log(`Skipped ${binaryOrLargeFiles} binary or oversized files`, 1);
        }

        return contents;
    }

    private async readFileWithLimit(filePath: string): Promise<{ content: string; truncated: boolean } | null> {
        try {
            const stats = await fs.stat(filePath);
            if (stats.size > 1_000_000) {
                return null;
            }

            const content = await fs.readFile(filePath, 'utf-8');
            if (this.isBinary(content)) {
                return null;
            }

            const tokens = encode(content).length;
            if (tokens <= this.maxTokensPerFile) {
                return { content, truncated: false };
            }

            const lines = content.split('\n');
            let truncatedContent = '';
            let currentTokens = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i] + '\n';
                const lineTokens = encode(line).length;
                if (currentTokens + lineTokens > this.maxTokensPerFile) {
                    truncatedContent += `\n... [File truncated after ${i} lines] ...`;
                    break;
                }
                truncatedContent += line;
                currentTokens += lineTokens;
            }

            return { content: truncatedContent, truncated: true };
        } catch (error) {
            throw error;
        }
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.js': 'javascript', '.ts': 'typescript', '.jsx': 'javascript',
            '.tsx': 'typescript', '.py': 'python', '.go': 'go', '.java': 'java',
            '.kt': 'kotlin', '.rs': 'rust', '.cs': 'csharp', '.cpp': 'cpp',
            '.c': 'c', '.php': 'php', '.rb': 'ruby', '.swift': 'swift',
            '.yml': 'yaml', '.yaml': 'yaml', '.json': 'json', '.xml': 'xml',
            '.md': 'markdown', '.html': 'html', '.css': 'css',
        };
        return languageMap[ext] || 'text';
    }

    private isBinary(content: string): boolean {
        const sample = content.substring(0, Math.min(512, content.length));
        for (let i = 0; i < sample.length; i++) {
            if (sample.charCodeAt(i) === 0) {
                return true;
            }
        }
        return false;
    }
}