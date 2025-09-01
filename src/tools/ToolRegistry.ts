import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import type { ToolSet } from 'ai';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { SecurityPolicyEngine } from '../security/SecurityPolicyEngine.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { HITLManager } from '../services/HITLManager.js';

export class ToolNames {
    static readonly SHELL_EXECUTOR = 'shell_executor';
    static readonly MULTI_COMMAND = 'multi_command';
    static readonly CREATE_FILE = 'create_file';
    static readonly WRITE_FILE = 'write_file';
    static readonly APPLY_PATCH = 'apply_patch';
    static readonly FIND_FILES = 'find_files';
    static readonly WEB_SEARCH = 'web_search';
    static readonly URL_FETCH = 'url_fetch';
    static readonly GIT_STATUS = 'git_status';
    static readonly GIT_LOG = 'git_log';
    static readonly GIT_DIFF = 'git_diff';
    static readonly SAVE_MEMORY = 'save_memory';
    static readonly TODO_MANAGER = 'todo_manager';
    static readonly START_SUBAGENT = 'start_subagent';
}

export type ToolName = typeof ToolNames[keyof typeof ToolNames];

export interface ToolContext {
    configLoader: ConfigLoader;
    securityEngine: SecurityPolicyEngine;
    eventEmitter: UIEventEmitter;
    hitlManager: HITLManager;
}

export interface ToolDefinition {
    name: string;
    tool: any;
    category?: string;
    description?: string;
}

export interface ToolExecutionResult {
    result?: any;
    error?: string;
    displayDetails?: string;
}

@injectable()
export class ToolRegistry {
    private tools = new Map<string, ToolDefinition>();
    private toolContext: ToolContext;

    constructor(
        @inject(TYPES.ConfigLoader) configLoader: ConfigLoader,
        @inject(TYPES.SecurityPolicyEngine) securityEngine: SecurityPolicyEngine,
        @inject(TYPES.UIEventEmitter) eventEmitter: UIEventEmitter,
        @inject(TYPES.HITLManager) hitlManager: HITLManager
    ) {
        this.toolContext = {
            configLoader,
            securityEngine,
            eventEmitter,
            hitlManager
        };
    }

    register(definition: ToolDefinition): void {
        this.tools.set(definition.name, definition);
    }

    registerMultiple(definitions: ToolDefinition[]): void {
        definitions.forEach(def => this.register(def));
    }

    get(name: string): any {
        return this.tools.get(name)?.tool;
    }

    getAll(): ToolSet {
        const toolSet: ToolSet = {};
        for (const [name, definition] of this.tools) {
            toolSet[name] = definition.tool;
        }
        return toolSet;
    }

    getToolNames(): string[] {
        return Array.from(this.tools.keys());
    }

    getContext(): ToolContext {
        return this.toolContext;
    }

    clear(): void {
        this.tools.clear();
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    unregister(name: string): boolean {
        return this.tools.delete(name);
    }

    getByCategory(category: string): ToolDefinition[] {
        return Array.from(this.tools.values()).filter(def => def.category === category);
    }
}