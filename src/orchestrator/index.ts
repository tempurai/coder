type AgentType = 'search' | 'debug' | 'code' | 'general';

export class TaskOrchestrator {
    async route(query: string): Promise<AgentType> {
        if (query.includes('search') || query.includes('find')) return 'search';
        if (query.includes('fix') || query.includes('debug')) return 'debug';
        if (query.includes('add') || query.includes('create')) return 'code';
        return 'general';
    }
}