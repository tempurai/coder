import * as path from 'path';
import * as fs from 'fs/promises';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { EvidenceCollector } from './EvidenceCollector.js';
import { FileContentCollector } from './FileContentCollector.js';
import { ProjectAnalyzer, type ProjectIndex } from './ProjectAnalyzer.js';
import { GitTracker } from './GitTracker.js';
import type { IndexOptions, ProjectIndexResult } from './index.js';

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
            console.log('Starting project analysis...');
            console.log(`   Project root: ${this.projectRoot}`);
            console.log(`   Output path: ${outputPath}`);

            const status = await this.getStatus();
            const currentHash = await this.gitTracker.getCurrentHash();
            console.log(`   Current Git hash: ${currentHash.substring(0, 8)}...`);

            if (!options.force && status.exists && status.gitHash === currentHash) {
                console.log('Index is up to date with current Git HEAD. Using existing index.');
                return {
                    success: true,
                    indexPath: outputPath,
                    stats: await this.getStatsFromExisting(),
                };
            }

            console.log(`Starting ${options.force ? 'full' : 'incremental'} project analysis...`);

            // Phase 1: 收集项目证据
            console.log('\nPhase 1: Collecting project evidence...');
            const evidenceCollector = new EvidenceCollector(this.projectRoot);
            const evidence = await evidenceCollector.collect();
            console.log('Evidence collection complete.');

            // Phase 2: 收集重要文件内容
            console.log('\nPhase 2: Collecting important file contents...');
            const contentCollector = new FileContentCollector(this.projectRoot);
            const fileContents = await contentCollector.collect(evidence.importantPaths);
            console.log(`File content collection complete (${fileContents.length} files).`);

            // Phase 3: AI驱动的项目分析
            console.log('\nPhase 3: AI-powered project analysis...');
            const analyzer = new ProjectAnalyzer();
            const analysis = await analyzer.analyze({
                evidence,
                fileContents,
                projectRoot: this.projectRoot,
            });
            console.log('AI analysis complete.');

            // Phase 4: 最终处理和保存项目索引
            console.log('\nPhase 4: Finalizing and saving project index...');
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
            console.log(`Project index saved to: ${outputPath}`);

            const stats = {
                filesAnalyzed: fileContents.length,
                servicesFound: analysis.services.length,
                endpointsFound: analysis.services.reduce((sum, s) => sum + (s.endpoints?.length || 0), 0),
                directoriesAnalyzed: analysis.directories.length,
            };

            console.log('\nAnalysis Summary:');
            console.log(`   Files analyzed: ${stats.filesAnalyzed}`);
            console.log(`   Services found: ${stats.servicesFound}`);
            console.log(`   Endpoints found: ${stats.endpointsFound}`);
            console.log(`   Directories analyzed: ${stats.directoriesAnalyzed}`);

            return {
                success: true,
                indexPath: outputPath,
                stats,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('\n❌ Project analysis failed:', errorMessage);
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