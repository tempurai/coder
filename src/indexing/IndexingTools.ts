import { z } from 'zod';
import { indexProject, getIndexStatus } from './index.js';
import { getContainer } from '../di/container.js';
import { TYPES } from '../di/types.js';
import { ProjectIndexer } from './ProjectIndexer.js';

export const IndexingTools = {
    project_index: {
        description: `Analyze and index current project structure, generating detailed project information including services, endpoints, directory structure, etc.
Suitable for:
- Understanding overall project structure and architecture
- Analyzing project services and API endpoints
- Viewing project tech stack and frameworks  
- Getting project directory organization and purpose descriptions
Supports both incremental and full analysis modes.`,
        parameters: z.object({
            mode: z.enum(['incremental', 'full']).default('incremental').describe('Analysis mode: incremental=incremental analysis, full=full re-analysis'),
            outputPath: z.string().optional().describe('Output path, defaults to .tempurai/indexing.json')
        }),
        execute: async (args: { mode: 'incremental' | 'full'; outputPath?: string }) => {
            try {
                const container = getContainer();
                const indexer = container.get<ProjectIndexer>(TYPES.ProjectIndexer);

                const result = await indexer.analyze({
                    force: args.mode === 'full'
                });

                if (result.success) {
                    return {
                        result: `Project index generated successfully!
- Index file: ${result.indexPath}
- Files analyzed: ${result.stats.filesAnalyzed}
- Services found: ${result.stats.servicesFound}
- Endpoints found: ${result.stats.endpointsFound}
- Directories analyzed: ${result.stats.directoriesAnalyzed}`,
                        indexPath: result.indexPath,
                        stats: result.stats
                    };
                } else {
                    return {
                        error: `Project index generation failed: ${result.error}`,
                        indexPath: result.indexPath
                    };
                }
            } catch (error) {
                return {
                    error: `Project index generation exception: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            }
        }
    },

    project_index_status: {
        description: `Check project index status including existence, last update time, Git version, etc.`,
        parameters: z.object({}),
        execute: async () => {
            try {
                const container = getContainer();
                const indexer = container.get<ProjectIndexer>(TYPES.ProjectIndexer);

                const status = await indexer.getStatus();

                if (status.exists) {
                    return {
                        result: `Project index status:
- Exists: Yes
- Last updated: ${status.lastUpdated?.toLocaleString() || 'Unknown'}
- Git hash: ${status.gitHash || 'Unknown'}`,
                        ...status
                    };
                } else {
                    return {
                        result: 'Project index does not exist. Please run index analysis first.',
                        exists: false
                    };
                }
            } catch (error) {
                return {
                    error: `Failed to check index status: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            }
        }
    }
};