import * as path from 'path';
import { z } from 'zod';
import { IndexingAgent } from './IndexingAgent.js';
import { EndpointExtractor } from './EndpointExtractor.js';
import { UNIFIED_ANALYSIS_PROMPT } from './IndexingAgentPrompt.js';
import type { Evidence } from './EvidenceCollector.js';
import type { FileContent } from './FileContentCollector.js';

// --- Centralized Type Definitions ---

export interface LanguageInfo {
    name: string;
    count: number;
}

export interface ProjectOverview {
    name: string;
    description: string;
    techStack: string[];
    languages: LanguageInfo[];
    totalFiles: number;
}

export interface DirectoryInfo {
    path: string;
    role: string;
    description: string;
    fileCount: number;
    estimatedTokenCount: number;
    importance: 'high' | 'medium' | 'low';
    mergedWith?: string[];
}

export interface EndpointInfo {
    method: string;
    path: string;
    handler?: string;
    file: string;
    line?: number;
}

export interface DataSourceInfo {
    type: 'database' | 'redis' | 'queue' | 'file' | 'api';
    config: string;
    connectionString?: string;
}

export interface ServiceInfo {
    name: string;
    type: 'http' | 'grpc' | 'worker' | 'cli' | 'library';
    path: string;
    description: string;
    configPath?: string;
    framework?: string;
    ports?: number[];
    endpoints?: EndpointInfo[];
    dataSources?: DataSourceInfo[];
}

export interface ProjectIndex {
    schemaVersion: string;
    generatedAt: string;
    gitHash: string;
    overview: ProjectOverview;
    directories: DirectoryInfo[];
    services: ServiceInfo[];
}

interface AnalysisInput {
    evidence: Evidence;
    fileContents: FileContent[];
    projectRoot: string;
}

export interface ProjectAnalysis {
    overview: ProjectOverview;
    directories: DirectoryInfo[];
    services: ServiceInfo[];
}

const DirectoryBatchSchema = z.object({
    directories: z.array(z.object({
        path: z.string(),
        role: z.string(),
        description: z.string(),
        importance: z.enum(['high', 'medium', 'low']),
        mergedWith: z.array(z.string()).optional(),
    }))
});

const InitialAnalysisSchema = z.object({
    overview: z.object({
        name: z.string(),
        description: z.string(),
        techStack: z.array(z.string()),
        languages: z.array(z.object({ name: z.string(), count: z.number() })),
        totalFiles: z.number().optional(), // BUG FIX: Make optional to solve compile error
    }),
    services: z.array(z.object({
        name: z.string(),
        type: z.enum(['http', 'grpc', 'worker', 'cli', 'library']),
        path: z.string(),
        description: z.string(),
        configPath: z.string().optional(),
    })),
    directories: z.array(z.object({
        path: z.string(),
        role: z.string(),
        description: z.string(),
        importance: z.enum(['high', 'medium', 'low']),
        mergedWith: z.array(z.string()).optional(),
    })).optional(),
});


export class ProjectAnalyzer {
    private readonly agent = new IndexingAgent();
    private readonly BATCH_TOKEN_LIMIT = 200000;

    async analyze(input: AnalysisInput): Promise<ProjectAnalysis> {
        console.log('   Extracting endpoints from all collected files...');
        const endpointExtractor = new EndpointExtractor();
        const extractedEndpoints = await endpointExtractor.extractFromFiles(input.fileContents);
        console.log(`   Found ${extractedEndpoints.length} potential endpoints.`);

        console.log('   Grouping files by directory for batch processing...');
        const directoryGroups = this.groupFilesByDirectory(input.fileContents);
        const analysisBatches = this.createAnalysisBatches(directoryGroups);
        console.log(`   Created ${analysisBatches.length} batches for analysis.`);

        let finalAnalysis: ProjectAnalysis | null = null;
        let processedDirectories: DirectoryInfo[] = [];

        for (let i = 0; i < analysisBatches.length; i++) {
            const batch = analysisBatches[i];
            console.log(`\n   Analyzing Batch ${i + 1}/${analysisBatches.length} (${batch.files.length} files, ~${batch.tokenCount} tokens)...`);

            const prompt = this.buildAnalysisPrompt(input.evidence, extractedEndpoints, batch.files, finalAnalysis);

            try {
                if (i === 0) {
                    const initialAnalysis = await this.agent.generateObject(
                        [{ role: 'system', content: UNIFIED_ANALYSIS_PROMPT }, { role: 'user', content: prompt }],
                        InitialAnalysisSchema
                    );

                    const safeAnalysis = { ...initialAnalysis, services: initialAnalysis.services || [], directories: initialAnalysis.directories || [] } as ProjectAnalysis;
                    finalAnalysis = this.postProcessAnalysis(safeAnalysis, extractedEndpoints, input);

                    processedDirectories.push(...(finalAnalysis.directories || []));

                    console.log(`   Batch ${i + 1}: Initial analysis successful. Found ${finalAnalysis.services.length} services and ${finalAnalysis.directories.length} directories.`);
                } else {
                    const directoryBatch = await this.agent.generateObject(
                        [{ role: 'system', content: UNIFIED_ANALYSIS_PROMPT }, { role: 'user', content: prompt }],
                        DirectoryBatchSchema
                    );
                    const newDirectories = this.postProcessBatch(directoryBatch.directories, batch.files);
                    processedDirectories.push(...newDirectories);
                    console.log(`   Batch ${i + 1}: Successfully analyzed and added ${newDirectories.length} new directories.`);
                }
            } catch (error) {
                console.error(`   LLM analysis for Batch ${i + 1} failed:`, error instanceof Error ? error.message : 'Unknown error');
                if (error instanceof Error && error.stack) console.error('   Stack trace:', error.stack);
            }
        }

        if (!finalAnalysis) {
            throw new Error("Initial project analysis failed, cannot proceed.");
        }

        finalAnalysis.directories = processedDirectories;
        console.log('\n   Final analysis results:');
        console.log(`     Project name: ${finalAnalysis.overview.name}`);
        console.log(`     Tech stack: ${finalAnalysis.overview.techStack.join(', ')}`);
        console.log(`     Total services identified: ${(finalAnalysis.services || []).length}`);
        console.log(`     Total directories analyzed: ${(finalAnalysis.directories || []).length}`);

        return finalAnalysis;
    }

    private groupFilesByDirectory(files: FileContent[]): Map<string, FileContent[]> {
        const groups = new Map<string, FileContent[]>();
        files.forEach(file => {
            const dir = path.dirname(file.path);
            if (!groups.has(dir)) groups.set(dir, []);
            groups.get(dir)!.push(file);
        });
        return groups;
    }

    private createAnalysisBatches(groups: Map<string, FileContent[]>): { files: FileContent[], tokenCount: number }[] {
        const batches: { files: FileContent[], tokenCount: number }[] = [];
        let currentBatch: FileContent[] = [];
        let currentTokenCount = 0;

        for (const [, files] of groups.entries()) {
            const groupTokenCount = files.reduce((sum, f) => sum + f.tokens, 0);
            if (currentTokenCount + groupTokenCount > this.BATCH_TOKEN_LIMIT && currentBatch.length > 0) {
                batches.push({ files: currentBatch, tokenCount: currentTokenCount });
                currentBatch = [];
                currentTokenCount = 0;
            }
            currentBatch.push(...files);
            currentTokenCount += groupTokenCount;
        }

        if (currentBatch.length > 0) {
            batches.push({ files: currentBatch, tokenCount: currentTokenCount });
        }

        return batches;
    }

    private buildAnalysisPrompt(evidence: Evidence, endpoints: any[], files: FileContent[], existingAnalysis: ProjectAnalysis | null): string {
        let prompt = '';
        if (existingAnalysis) {
            prompt += `You are continuing an analysis. Here is the "Existing Analysis Context":\n\n\`\`\`json\n${JSON.stringify(existingAnalysis, null, 2)}\n\`\`\`\n\n`;
            prompt += `Now, analyze the following NEW files and provide ONLY the analysis for their parent directories.\n`;
        } else {
            prompt += `Analyze this project based on its configuration and files to generate a complete project index.\n## Project Evidence\n`;
            prompt += `- Languages: ${evidence.languages.map((l: any) => `${l.name}(${l.count})`).join(', ')}\n`;
            prompt += `- Frameworks: ${evidence.frameworks.join(', ') || 'None'}\n`;
            if (endpoints.length > 0) {
                prompt += `\n## Statically Extracted Endpoints\n`;
                prompt += endpoints.slice(0, 20).map((ep: any) => `- ${ep.method} ${ep.path} in ${ep.file}`).join('\n') + '\n';
            }
        }

        prompt += `\n## File Contents for Analysis (${files.length} files)\n`;
        files.forEach((file: any) => {
            prompt += `---\nPATH: ${file.path}\nCONTENT:\n${file.content}\n---\n`;
        });

        return prompt;
    }

    private postProcessBatch(directories: Omit<DirectoryInfo, 'fileCount' | 'estimatedTokenCount'>[], batchFiles: FileContent[]): DirectoryInfo[] {
        return directories.map(dir => {
            const dirFiles = batchFiles.filter(f => f.path.startsWith(dir.path));
            return {
                ...dir,
                fileCount: dirFiles.length,
                estimatedTokenCount: dirFiles.reduce((sum, f) => sum + f.tokens, 0),
            };
        });
    }

    private postProcessAnalysis(analysis: Partial<ProjectAnalysis>, allEndpoints: any[], input: AnalysisInput): ProjectAnalysis {
        const fullAnalysis = {
            overview: analysis.overview!,
            services: analysis.services || [],
            directories: analysis.directories || [],
        };

        fullAnalysis.services.forEach(service => {
            if (service.type === 'http') {
                service.endpoints = allEndpoints
                    .filter(ep => ep.file.startsWith(service.path))
                    .map(ep => ({ method: ep.method, path: ep.path, handler: ep.handler, file: ep.file, line: ep.line }));
            }
        });

        fullAnalysis.directories = this.postProcessBatch(fullAnalysis.directories, input.fileContents);

        if (fullAnalysis.overview) {
            fullAnalysis.overview.totalFiles = input.fileContents.length;
        }

        return fullAnalysis as ProjectAnalysis;
    }
}