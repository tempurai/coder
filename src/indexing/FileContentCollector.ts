import * as path from 'path';
import * as fs from 'fs/promises';
import { encode } from 'gpt-tokenizer';

interface FileContent {
    path: string;
    content: string;
    tokens: number;
    language: string;
    truncated: boolean;
}

export class FileContentCollector {
    private readonly maxTokensPerFile = 2000;
    private readonly maxTotalTokens = 80000;

    constructor(private readonly projectRoot: string) { }

    async collect(importantPaths: string[]): Promise<FileContent[]> {
        const contents: FileContent[] = [];
        let totalTokens = 0;

        for (const relativePath of importantPaths) {
            if (totalTokens >= this.maxTotalTokens) break;

            const fullPath = path.join(this.projectRoot, relativePath);

            try {
                const content = await this.readFileWithLimit(fullPath);
                if (!content) continue;

                const tokens = encode(content.content).length;
                const language = this.detectLanguage(relativePath);

                contents.push({
                    path: relativePath,
                    content: content.content,
                    tokens,
                    language,
                    truncated: content.truncated,
                });

                totalTokens += tokens;
            } catch {
                continue;
            }
        }

        return contents;
    }

    private async readFileWithLimit(filePath: string): Promise<{ content: string; truncated: boolean } | null> {
        try {
            const stats = await fs.stat(filePath);

            if (stats.size > 100000) return null;

            const content = await fs.readFile(filePath, 'utf-8');

            if (this.isBinary(content)) return null;

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
                    truncatedContent += `\n[top ${i} lines] // remaining lines truncated for token limit`;
                    break;
                }

                truncatedContent += line;
                currentTokens += lineTokens;
            }

            return { content: truncatedContent, truncated: true };
        } catch {
            return null;
        }
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath);
        const languageMap: Record<string, string> = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.go': 'go',
            '.java': 'java',
            '.kt': 'kotlin',
            '.rs': 'rust',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.php': 'php',
            '.rb': 'ruby',
            '.swift': 'swift',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.json': 'json',
            '.xml': 'xml',
        };

        return languageMap[ext] || 'text';
    }

    private isBinary(content: string): boolean {
        for (let i = 0; i < Math.min(1000, content.length); i++) {
            const charCode = content.charCodeAt(i);
            if (charCode === 0 || (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13)) {
                return true;
            }
        }
        return false;
    }
}