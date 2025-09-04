import * as path from 'path';
import * as fs from 'fs/promises';
import { encode } from 'gpt-tokenizer';

export interface FileContent {
    path: string;
    content: string;
    tokens: number;
    language: string;
    truncated: boolean;
}

export class FileContentCollector {
    private readonly maxTokensPerFile = 4000;
    private readonly maxTotalTokens = 800000; // Increased to allow larger projects before stopping collection

    constructor(private readonly projectRoot: string) { }

    async collect(importantPaths: string[]): Promise<FileContent[]> {
        console.log(`   Collecting content from up to ${importantPaths.length} important files...`);

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
                console.log(`   Reached total token limit (${this.maxTotalTokens}). Skipping remaining ${skippedForTokenLimit} files.`);
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

                if (processedFiles % 20 === 0 && processedFiles < importantPaths.length) {
                    console.log(`   ...processed ${processedFiles}/${importantPaths.length} files, ~${totalTokens} tokens collected.`);
                }
            } catch (error) {
                console.warn(`   Warning: Could not read file ${relativePath}: ${error instanceof Error ? error.message : 'Skipping'}`);
                errorFiles++;
                continue;
            }
        }

        console.log('   File collection summary:');
        console.log(`     Successfully processed: ${processedFiles} files`);
        console.log(`     Total tokens collected: ~${totalTokens}`);
        console.log(`     Truncated files (exceeded ${this.maxTokensPerFile} tokens): ${truncatedFiles}`);
        console.log(`     Skipped (binary/too large): ${binaryOrLargeFiles}`);
        console.log(`     Skipped (token limit reached): ${skippedForTokenLimit}`);
        console.log(`     Errors: ${errorFiles}`);

        return contents;
    }

    private async readFileWithLimit(filePath: string): Promise<{ content: string; truncated: boolean } | null> {
        try {
            const stats = await fs.stat(filePath);
            if (stats.size > 1_000_000) { // 1MB hard limit
                console.log(`     Skipping very large file: ${path.basename(filePath)} (${(stats.size / 1024).toFixed(1)}KB)`);
                return null;
            }

            const content = await fs.readFile(filePath, 'utf-8');

            if (this.isBinary(content)) {
                console.log(`     Skipping binary file: ${path.basename(filePath)}`);
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
            // Errors will be caught in the main collect loop
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