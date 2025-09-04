import * as path from 'path';
import * as fs from 'fs/promises';
import { EvidenceCollector } from './EvidenceCollector.js';
import { FileContentCollector } from './FileContentCollector.js';
import { ProjectAnalyzer } from './ProjectAnalyzer.js';
import { GitTracker } from './GitTracker.js';
import type { IndexOptions, ProjectIndexResult } from './index.js';

interface ProjectIndex {
    version: string;
    generatedAt: string;
    gitHash: string;
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

export class ProjectIndexer {
    private readonly projectRoot = process.cwd();
    private readonly outputPath = path.join(this.projectRoot, '.tempurai', 'project-index.json');
    private readonly gitTracker = new GitTracker(this.projectRoot);

    async analyze(options: IndexOptions): Promise<ProjectIndexResult> {
        try {
            const status = await this.getStatus();
            const currentHash = await this.gitTracker.getCurrentHash();

            if (!options.force && !status.exists) {
                console.log('No existing index found, automatically switching to full analysis mode...');
                options.force = true;
            }

            if (!options.force && status.exists && status.gitHash === currentHash) {
                console.log('Index is up to date, using existing results...');
                return {
                    success: true,
                    indexPath: this.outputPath,
                    stats: await this.getStatsFromExisting(),
                };
            }

            console.log(`Starting ${options.force ? 'full' : 'incremental'} project analysis...`);

            const evidenceCollector = new EvidenceCollector(this.projectRoot);
            const evidence = await evidenceCollector.collect();

            const contentCollector = new FileContentCollector(this.projectRoot);
            const fileContents = await contentCollector.collect(evidence.importantPaths);

            const analyzer = new ProjectAnalyzer();
            const analysis = await analyzer.analyze({
                evidence,
                fileContents,
                projectRoot: this.projectRoot,
            });

            const index: ProjectIndex = {
                version: '1.0.0',
                generatedAt: new Date().toISOString(),
                gitHash: currentHash,
                overview: analysis.overview,
                directories: analysis.directories,
                services: analysis.services,
            };

            await this.ensureOutputDir();
            await fs.writeFile(this.outputPath, JSON.stringify(index, null, 2));

            return {
                success: true,
                indexPath: this.outputPath,
                stats: {
                    filesAnalyzed: fileContents.length,
                    servicesFound: analysis.services.length,
                    endpointsFound: analysis.services.reduce((sum, s) => sum + (s.endpoints?.length || 0), 0),
                    directoriesAnalyzed: analysis.directories.length,
                },
            };
        } catch (error) {
            return {
                success: false,
                indexPath: this.outputPath,
                stats: { filesAnalyzed: 0, servicesFound: 0, endpointsFound: 0, directoriesAnalyzed: 0 },
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async getStatus(): Promise<{
        exists: boolean;
        lastUpdated?: Date;
        gitHash?: string;
    }> {
        try {
            const stats = await fs.stat(this.outputPath);
            const content = await fs.readFile(this.outputPath, 'utf-8');
            const index = JSON.parse(content) as ProjectIndex;

            return {
                exists: true,
                lastUpdated: stats.mtime,
                gitHash: index.gitHash,
            };
        } catch {
            return { exists: false };
        }
    }

    private async ensureOutputDir(): Promise<void> {
        await fs.mkdir(path.dirname(this.outputPath), { recursive: true });
    }

    private async getStatsFromExisting(): Promise<ProjectIndexResult['stats']> {
        try {
            const content = await fs.readFile(this.outputPath, 'utf-8');
            const index = JSON.parse(content) as ProjectIndex;

            return {
                filesAnalyzed: index.overview.totalFiles,
                servicesFound: index.services.length,
                endpointsFound: index.services.reduce((sum, s) => sum + (s.endpoints?.length || 0), 0),
                directoriesAnalyzed: index.directories.length,
            };
        } catch {
            return { filesAnalyzed: 0, servicesFound: 0, endpointsFound: 0, directoriesAnalyzed: 0 };
        }
    }
}