import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import { getContainer } from '../di/container.js';
import { TYPES } from '../di/types.js';
import type { Config } from '../config/ConfigLoader.js';
import { ZodSchema } from 'zod';

export type IndexingMessage = { role: 'system' | 'user' | 'assistant', content: string };
export type IndexingMessages = IndexingMessage[];

export class IndexingAgent {
    private model!: LanguageModel;
    private config!: Config;
    private initialized = false;

    private async initialize(): Promise<void> {
        if (this.initialized) return;

        console.log('   Initializing LLM for project analysis...');
        const container = getContainer();
        this.model = await container.getAsync<LanguageModel>(TYPES.LanguageModel);
        this.config = container.get<Config>(TYPES.Config);
        console.log(`   LLM initialized: ${this.config.models?.[0]?.provider}:${this.config.models?.[0]?.name}`);
        this.initialized = true;
    }

    async generateObject<T>(messages: IndexingMessages, schema: ZodSchema<T>): Promise<T> {
        await this.initialize();

        const totalInputChars = messages.map(m => m.content).join('').length;
        console.log('   Making LLM object generation request...');
        console.log(`     - Model: ${this.config.models?.[0]?.provider}:${this.config.models?.[0]?.name}`);
        console.log(`     - Input messages: ${messages.length}`);
        console.log(`     - Total input characters: ~${(totalInputChars / 1024).toFixed(1)} KB`);

        try {
            const { object } = await generateObject({
                model: this.model,
                messages,
                schema,
                maxTokens: this.config.maxTokens,
                temperature: this.config.temperature,
            });
            console.log('   LLM object generation successful.');
            return object;
        } catch (error) {
            console.error('   LLM object generation failed:', error instanceof Error ? error.message : 'Unknown error');
            if (error instanceof Error && error.stack) {
                console.error('   Error stack trace:', error.stack);
            }
            throw new Error(`Indexing object generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}