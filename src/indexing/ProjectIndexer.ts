import * as path from 'path';
import * as fs from 'fs/promises';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { EvidenceCollector } from './EvidenceCollector.js';
import { FileContentCollector } from './FileContentCollector.js';
import { ProjectAnalyzer, type ProjectIndex } from './ProjectAnalyzer.js';
import { GitTracker } from './GitTracker.js';
import { IndentLogger } from '../utils/IndentLogger.js';

export interface IndexOptions {
    force?: boolean;
    outputPath?: string;
    modelConfig?: {
        provider: 'openai' | 'anthropic' | 'google';
        apiKey: string;
        model: string;
    };
}

export interface ProjectIndexResult {
    success: boolean;
    indexPath: string;
    stats: {
        filesAnalyzed: number;
        servicesFound: number;
        endpointsFound: number;
        directoriesAnalyzed: number;
    };
    error?: string;
}

@injectable()
export class ProjectIndexer {
    private readonly projectRoot = process.cwd();
    private readonly gitTracker = new GitTracker(this.projectRoot);

    constructor(
        @inject(TYPES.ConfigLoader) private configLoader: ConfigLoader
    ) { }

    async analyze(options: IndexOptions): Promise<ProjectIndexResult> {
        const outputPath = this.configLoader.getIndexingFilePath();

        try {
            IndentLogger.logAndSendEvent('Starting project analysis');
            IndentLogger.log(`Project root: ${this.projectRoot}`, 1);
            IndentLogger.log(`Output path: ${outputPath}`, 1);

            const status = await this.getStatus();
            const currentHash = await this.gitTracker.getCurrentHash();
            IndentLogger.log(`Current Git hash: ${currentHash.substring(0, 8)}...`, 1);

            if (!options.force && status.exists && status.gitHash === currentHash) {
                IndentLogger.logAndSendEvent('Index is up to date with current Git HEAD. Using existing index.', 1);
                return {
                    success: true,
                    indexPath: outputPath,
                    stats: await this.getStatsFromExisting(),
                };
            }

            IndentLogger.logAndSendEvent(`Starting ${options.force ? 'full' : 'incremental'} project analysis...`);

            // Phase 1: 收集项目证据
            IndentLogger.logAndSendEvent('Phase 1: Collecting project evidence...')
            const evidenceCollector = new EvidenceCollector(this.projectRoot);
            const evidence = await evidenceCollector.collect();

            IndentLogger.log(`Found ${evidence.languages.length} programming languages`, 1);
            IndentLogger.log(`Detected frameworks: ${evidence.frameworks.join(', ') || 'None'}`, 1);
            IndentLogger.log(`Located ${evidence.importantPaths.length} important files`, 1);
            IndentLogger.logAndSendEvent('Evidence collection complete.', 1);

            // Phase 2: 收集重要文件内容
            IndentLogger.logAndSendEvent('Phase 2: Collecting important file contents...');
            const contentCollector = new FileContentCollector(this.projectRoot);
            const fileContents = await contentCollector.collect(evidence.importantPaths);

            IndentLogger.log(`Processed ${fileContents.length} files`, 1);
            const totalTokens = fileContents.reduce((sum, f) => sum + f.tokens, 0);

            IndentLogger.log(`Collected ~${totalTokens} tokens`, 1);
            this.logTruncationSummary(fileContents);
            IndentLogger.logAndSendEvent('File content collection complete.', 1);

            // Phase 3: AI驱动的项目分析
            IndentLogger.logAndSendEvent('Phase 3: AI-powered project analysis...');
            const analyzer = new ProjectAnalyzer();
            const analysis = await analyzer.analyze({
                evidence,
                fileContents,
                projectRoot: this.projectRoot,
            });
            IndentLogger.log(`Analyzed ${analysis.directories.length} directories`, 1);
            IndentLogger.log(`Identified ${analysis.services.length} services`, 1);
            const endpointCount = analysis.services.reduce((sum, s) => sum + (s.endpoints?.length || 0), 0);
            if (endpointCount > 0) {
                IndentLogger.log(`Found ${endpointCount} API endpoints`, 1);
            }

            IndentLogger.logAndSendEvent('AI analysis complete.', 1);

            // Phase 4: 最终处理和保存项目索引
            IndentLogger.logAndSendEvent('Phase 4: Finalizing and saving project index...');
            const index: ProjectIndex = {
                schemaVersion: '1.1.0',
                generatedAt: new Date().toISOString(),
                gitHash: currentHash,
                overview: analysis.overview,
                directories: analysis.directories,
                services: analysis.services,
            };

            await this.ensureOutputDir(outputPath);
            await fs.writeFile(outputPath, JSON.stringify(index, null, 2));
            IndentLogger.logAndSendEvent(`Project index saved successfully`, 1);

            const stats = {
                filesAnalyzed: fileContents.length,
                servicesFound: analysis.services.length,
                endpointsFound: endpointCount,
                directoriesAnalyzed: analysis.directories.length,
            };

            IndentLogger.logAndSendEvent('Analysis Summary:');
            IndentLogger.logAndSendEvent(`Files analyzed: ${stats.filesAnalyzed}`, 1);
            IndentLogger.logAndSendEvent(`Services found: ${stats.servicesFound}`, 1);
            if (stats.endpointsFound > 0) {
                IndentLogger.logAndSendEvent(`Endpoints found: ${stats.endpointsFound}`, 1);
            }
            IndentLogger.logAndSendEvent(`Directories analyzed: ${stats.directoriesAnalyzed}`, 1);

            return {
                success: true,
                indexPath: outputPath,
                stats,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            IndentLogger.logAndSendEvent('Project analysis failed');
            IndentLogger.logAndSendEvent(errorMessage, 1);
            if (error instanceof Error && error.stack) {
                console.error('Stack trace:', error.stack);
            }
            return {
                success: false,
                indexPath: outputPath,
                stats: { filesAnalyzed: 0, servicesFound: 0, endpointsFound: 0, directoriesAnalyzed: 0 },
                error: errorMessage,
            };
        }
    }

    private logTruncationSummary(fileContents: any[]): void {
        const truncated = fileContents.filter(f => f.truncated).length;
        if (truncated > 0) {
            IndentLogger.log(`${truncated} files truncated due to size limits`, 1);
        }
    }

    async getStatus(): Promise<{ exists: boolean; lastUpdated?: Date; gitHash?: string; }> {
        const outputPath = this.configLoader.getIndexingFilePath();

        try {
            const stats = await fs.stat(outputPath);
            const content = await fs.readFile(outputPath, 'utf-8');
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

    private async ensureOutputDir(outputPath: string): Promise<void> {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
    }

    private async getStatsFromExisting(): Promise<ProjectIndexResult['stats']> {
        const outputPath = this.configLoader.getIndexingFilePath();

        try {
            const content = await fs.readFile(outputPath, 'utf-8');
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