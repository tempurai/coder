import * as path from 'path';
import { IndentLogger } from '../utils/IndentLogger.js';

interface ExtractedEndpoint {
    method: string;
    path: string;
    handler?: string;
    file: string;
    line?: number;
    confidence: 'high' | 'medium' | 'low';
    evidence: string;
}

export class EndpointExtractor {
    private readonly frameworkPatterns = {
        express: [
            /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
            /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
        ],
        nestjs: [
            /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`]*)['"`]?\s*\)/g,
        ],
        fastapi: [
            /@app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
        ],
        flask: [
            /@app\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*methods\s*=\s*\[.*?['"`](GET|POST|PUT|DELETE|PATCH)['"`]/g,
        ],
        django: [
            /path\s*\(\s*r?['"`]([^'"`]+)['"`]/g,
        ],
        gin: [
            /r\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"`]([^'"`]+)['"`]/g,
        ],
        spring: [
            /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(['"`][^'"`]*['"`]|value\s*=\s*['"`][^'"`]*['"`])/g,
        ],
    };

    private readonly genericPatterns = [
        /(GET|POST|PUT|DELETE|PATCH)\s+['"`]([/\w\-{}:]+)['"`]/gi,
        /['"`](\/[/\w\-{}:]*?)['"`]/g,
    ];

    async extractFromFiles(files: Array<{ path: string; content: string }>): Promise<ExtractedEndpoint[]> {
        const endpoints: ExtractedEndpoint[] = [];
        let frameworkEndpoints = 0;
        let genericEndpoints = 0;
        let configEndpoints = 0;

        for (const file of files) {
            const fileEndpoints = await this.extractFromFile(file.path, file.content);

            fileEndpoints.forEach(ep => {
                if (ep.confidence === 'high') frameworkEndpoints++;
                else if (ep.evidence === 'OpenAPI specification') configEndpoints++;
                else genericEndpoints++;
            });
            endpoints.push(...fileEndpoints);
        }

        const deduplicatedEndpoints = this.deduplicateEndpoints(endpoints);

        if (deduplicatedEndpoints.length > 0) {
            IndentLogger.log(`Found endpoints: framework(${frameworkEndpoints}), generic(${genericEndpoints}), config(${configEndpoints})`, 1);
            const methodBreakdown = this.getMethodBreakdown(deduplicatedEndpoints);
            if (methodBreakdown.length > 0) {
                IndentLogger.log(`Methods: ${methodBreakdown.map(m => `${m.method}(${m.count})`).join(', ')}`, 1);
            }
        }

        return deduplicatedEndpoints;
    }

    private async extractFromFile(filePath: string, content: string): Promise<ExtractedEndpoint[]> {
        const endpoints: ExtractedEndpoint[] = [];
        const lines = content.split('\n');
        const framework = this.detectFramework(filePath, content);

        // 使用框架特定模式
        if (framework && this.frameworkPatterns[framework]) {
            for (const pattern of this.frameworkPatterns[framework]) {
                const matches = this.extractWithPattern(content, pattern, filePath, lines);
                endpoints.push(...matches);
            }
        }

        // 如果没有找到框架端点，尝试通用模式
        if (endpoints.length === 0) {
            for (const pattern of this.genericPatterns) {
                const matches = this.extractWithPattern(content, pattern, filePath, lines, 'low');
                endpoints.push(...matches);
            }
        }

        // 从配置文件提取
        const configEndpoints = await this.extractFromConfig(filePath, content);
        endpoints.push(...configEndpoints);

        return endpoints;
    }

    private extractWithPattern(
        content: string,
        pattern: RegExp,
        filePath: string,
        lines: string[],
        defaultConfidence: 'high' | 'medium' | 'low' = 'high'
    ): ExtractedEndpoint[] {
        const endpoints: ExtractedEndpoint[] = [];
        let match;

        while ((match = pattern.exec(content)) !== null) {
            let method: string;
            let pathStr: string;

            if (match[1] && match[2]) {
                method = match[1].toUpperCase();
                pathStr = match[2];
            } else if (match[2] && match[1]) {
                if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(match[2].toUpperCase())) {
                    method = match[2].toUpperCase();
                    pathStr = match[1];
                } else {
                    method = match[1].toUpperCase();
                    pathStr = match[2];
                }
            } else {
                continue;
            }

            const matchIndex = match.index || 0;
            const beforeMatch = content.substring(0, matchIndex);
            const lineNumber = beforeMatch.split('\n').length;

            endpoints.push({
                method,
                path: pathStr,
                file: filePath,
                line: lineNumber,
                confidence: defaultConfidence,
                evidence: match[0],
            });
        }

        return endpoints;
    }

    private detectFramework(filePath: string, content: string): keyof typeof this.frameworkPatterns | null {
        if (content.includes('@Controller') || content.includes('@Get(') || content.includes('@nestjs/')) {
            return 'nestjs';
        }
        if (content.includes('express') && (content.includes('app.get') || content.includes('router.get'))) {
            return 'express';
        }
        if (content.includes('fastapi') || content.includes('@app.get')) {
            return 'fastapi';
        }
        if (content.includes('@app.route') || content.includes('from flask')) {
            return 'flask';
        }
        if (path.basename(filePath) === 'urls.py' || content.includes('django.urls')) {
            return 'django';
        }
        if (content.includes('gin.') && content.includes('r.GET')) {
            return 'gin';
        }
        if (content.includes('@RestController') || content.includes('@GetMapping')) {
            return 'spring';
        }
        return null;
    }

    private async extractFromConfig(filePath: string, content: string): Promise<ExtractedEndpoint[]> {
        const endpoints: ExtractedEndpoint[] = [];

        // 处理OpenAPI/Swagger文件
        if (filePath.includes('openapi') || filePath.includes('swagger')) {
            try {
                const spec = JSON.parse(content);
                if (spec.paths) {
                    Object.entries(spec.paths).forEach(([path, methods]: [string, any]) => {
                        Object.keys(methods).forEach(method => {
                            if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                                endpoints.push({
                                    method: method.toUpperCase(),
                                    path,
                                    file: filePath,
                                    confidence: 'high',
                                    evidence: 'OpenAPI specification',
                                });
                            }
                        });
                    });
                }
            } catch {
                // 忽略解析错误
            }
        }

        return endpoints;
    }

    private deduplicateEndpoints(endpoints: ExtractedEndpoint[]): ExtractedEndpoint[] {
        const seen = new Set<string>();
        const unique: ExtractedEndpoint[] = [];

        for (const endpoint of endpoints) {
            const key = `${endpoint.method}:${endpoint.path}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(endpoint);
            }
        }

        // 按置信度和方法排序
        return unique.sort((a, b) => {
            const confScore = { high: 3, medium: 2, low: 1 };
            const confDiff = confScore[b.confidence] - confScore[a.confidence];
            if (confDiff !== 0) return confDiff;
            const methodDiff = a.method.localeCompare(b.method);
            if (methodDiff !== 0) return methodDiff;
            return a.path.localeCompare(b.path);
        });
    }

    private getMethodBreakdown(endpoints: ExtractedEndpoint[]): Array<{ method: string; count: number }> {
        const counts: Record<string, number> = {};
        endpoints.forEach(ep => {
            counts[ep.method] = (counts[ep.method] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([method, count]) => ({ method, count }))
            .sort((a, b) => b.count - a.count);
    }
}