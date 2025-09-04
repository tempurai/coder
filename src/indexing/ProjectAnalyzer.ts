import { z } from 'zod';
import { IndexingAgent } from './IndexingAgent.js';
import { EndpointExtractor } from './EndpointExtractor.js';
import type { Evidence } from './EvidenceCollector.js';

interface AnalysisInput {
    evidence: Evidence;
    fileContents: Array<{
        path: string;
        content: string;
        tokens: number;
        language: string;
    }>;
    projectRoot: string;
}

interface ProjectAnalysis {
    overview: {
        name: string;
        description: string;
        techStack: string[];
        languages: Record<string, number>;
        totalFiles: number;
    };
    directories: Array<{
        path: string;
        role: string;
        description: string;
        fileCount: number;
        tokenCount: number;
        importance: 'high' | 'medium' | 'low';
        keep: boolean;
        mergedWith?: string[];
    }>;
    services: Array<{
        name: string;
        type: 'http' | 'grpc' | 'worker' | 'cli' | 'library';
        path: string;
        framework?: string;
        ports?: number[];
        endpoints?: Array<{
            method: string;
            path: string;
            handler?: string;
            file: string;
            line?: number;
        }>;
        dataSources?: Array<{
            type: 'database' | 'redis' | 'queue' | 'file' | 'api';
            config: string;
            connectionString?: string;
        }>;
        dependencies: string[];
        configPath?: string;
    }>;
}

const AnalysisSchema = z.object({
    overview: z.object({
        name: z.string(),
        description: z.string(),
        techStack: z.array(z.string()),
        languages: z.record(z.number()),
        totalFiles: z.number()
    }),
    directories: z.array(z.object({
        path: z.string(),
        role: z.string(),
        description: z.string(),
        fileCount: z.number(),
        tokenCount: z.number(),
        importance: z.enum(['high', 'medium', 'low']),
        keep: z.boolean(),
        mergedWith: z.array(z.string()).optional()
    })),
    services: z.array(z.object({
        name: z.string(),
        type: z.enum(['http', 'grpc', 'worker', 'cli', 'library']),
        path: z.string(),
        framework: z.string().optional(),
        ports: z.array(z.number()).optional(),
        endpoints: z.array(z.object({
            method: z.string(),
            path: z.string(),
            handler: z.string().optional(),
            file: z.string(),
            line: z.number().optional()
        })).optional(),
        dataSources: z.array(z.object({
            type: z.enum(['database', 'redis', 'queue', 'file', 'api']),
            config: z.string(),
            connectionString: z.string().optional()
        })).optional(),
        dependencies: z.array(z.string()),
        configPath: z.string().optional()
    }))
});

export class ProjectAnalyzer {
    private readonly agent = new IndexingAgent();

    async analyze(input: AnalysisInput): Promise<ProjectAnalysis> {
        const endpointExtractor = new EndpointExtractor();
        const extractedEndpoints = await endpointExtractor.extractFromFiles(input.fileContents);

        const context = this.buildAnalysisContext(input, extractedEndpoints);
        const prompt = this.buildAnalysisPrompt(context);

        const analysis = await this.agent.generateObject(
            [
                { role: 'system', content: this.getSystemPrompt() },
                { role: 'user', content: prompt }
            ],
            AnalysisSchema
        );

        return this.postProcessAnalysis(analysis, extractedEndpoints, input);
    }

    private buildAnalysisContext(input: AnalysisInput, endpoints: any[]) {
        return {
            project: {
                languages: input.evidence.languages,
                frameworks: input.evidence.frameworks,
                databases: input.evidence.databases,
                ports: input.evidence.ports,
                dependencies: input.evidence.dependencies.slice(0, 50)
            },
            config: {
                dockerCompose: input.evidence.config.dockerCompose,
                packageJson: input.evidence.config.packageJson,
                hasOpenApi: !!input.evidence.config.openApi,
                hasKubernetes: input.evidence.config.kubernetes.length > 0
            },
            files: input.fileContents.slice(0, 30),
            extractedEndpoints: endpoints.slice(0, 100)
        };
    }

    private buildAnalysisPrompt(context: any): string {
        let prompt = `Analyze this project structure and provide a comprehensive analysis in JSON format.

## Project Overview
- Primary Languages: ${Object.entries(context.project.languages).map(([lang, count]) => `${lang}(${count})`).join(', ')}
- Detected Frameworks: ${context.project.frameworks.join(', ') || 'None'}
- Databases: ${context.project.databases.join(', ') || 'None'}
- Port Configuration: ${context.project.ports.map((p: any) => `${p.port}(${p.source})`).join(', ') || 'None'}

`;

        if (context.config.dockerCompose) {
            prompt += `## Docker Compose Configuration
\`\`\`yaml
${JSON.stringify(context.config.dockerCompose, null, 2)}
\`\`\`

`;
        }

        if (context.config.packageJson) {
            prompt += `## Package.json
\`\`\`json
${JSON.stringify(context.config.packageJson, null, 2)}
\`\`\`

`;
        }

        if (context.extractedEndpoints.length > 0) {
            prompt += `## Statically Extracted Endpoints (${context.extractedEndpoints.length} found)
${context.extractedEndpoints.slice(0, 20).map((ep: any) =>
                `- ${ep.method} ${ep.path} (${ep.file}:${ep.line || '?'})`
            ).join('\n')}

`;
        }

        prompt += `## Project Files Content

`;

        context.files.forEach((file: any, index: number) => {
            if (index < 25) {
                prompt += `---
PATH:${file.path}
CONTENT:
${file.content}

`;
            }
        });

        return prompt;
    }

    private getSystemPrompt(): string {
        return `You are a professional software project analyst. Based on the provided project information, generate a structured project index.

Requirements:
1. overview section should accurately describe what the project is and what technology stack it uses
2. directories section should reasonably analyze the purpose of each directory, prioritize by importance, merge directories with similar functions
3. services section should identify all services including HTTP services, workers, CLI tools, etc.
4. For HTTP services, list all endpoints, prioritizing statically analyzed results
5. Identify data source configurations and connection information
6. Use relative paths from project root for all paths

Output strict JSON format without any additional explanations.`;
    }

    private postProcessAnalysis(analysis: any, endpoints: any[], input: AnalysisInput): ProjectAnalysis {
        if (analysis.services) {
            analysis.services.forEach((service: any) => {
                if (service.type === 'http') {
                    const serviceEndpoints = endpoints.filter(ep =>
                        ep.file.startsWith(service.path) || service.path.includes(ep.file.split('/')[0])
                    );

                    if (serviceEndpoints.length > 0) {
                        service.endpoints = serviceEndpoints.map(ep => ({
                            method: ep.method,
                            path: ep.path,
                            handler: ep.handler,
                            file: ep.file,
                            line: ep.line
                        }));
                    }
                }
            });
        }

        if (analysis.directories) {
            analysis.directories.forEach((dir: any) => {
                const dirFiles = input.fileContents.filter(f => f.path.startsWith(dir.path));
                dir.fileCount = dirFiles.length;
                dir.tokenCount = dirFiles.reduce((sum, f) => sum + f.tokens, 0);
            });
        }

        if (analysis.overview) {
            analysis.overview.totalFiles = input.fileContents.length;
        }

        return analysis as ProjectAnalysis;
    }
}