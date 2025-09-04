import { getContainer } from '../di/container.js';
import { TYPES } from '../di/types.js';
import { ProjectIndexer } from './ProjectIndexer.js';

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

export async function indexProject(options: IndexOptions = {}): Promise<ProjectIndexResult> {
    const container = getContainer();
    const indexer = container.get<ProjectIndexer>(TYPES.ProjectIndexer);
    return await indexer.analyze(options);
}

export async function getIndexStatus(): Promise<{
    exists: boolean;
    lastUpdated?: Date;
    gitHash?: string;
}> {
    const container = getContainer();
    const indexer = container.get<ProjectIndexer>(TYPES.ProjectIndexer);
    return await indexer.getStatus();
}