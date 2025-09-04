import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import { getContainer } from '../di/container.js';
import { TYPES } from '../di/types.js';
import type { Config } from '../config/ConfigLoader.js';
import { ZodSchema } from 'zod';
import { IndentLogger } from '../utils/IndentLogger.js';

export type IndexingMessage = { role: 'system' | 'user' | 'assistant', content: string };
export type IndexingMessages = IndexingMessage[];

export class IndexingAgent {
    private model!: LanguageModel;
    private config!: Config;
    private initialized = false;

    private async initialize(): Promise<void> {
        if (this.initialized) return;

        const container = getContainer();
        this.model = await container.getAsync<LanguageModel>(TYPES.LanguageModel);
        this.config = container.get<Config>(TYPES.Config);
        this.initialized = true;
    }

    async generateObject<T>(messages: IndexingMessages, schema: ZodSchema<T>): Promise<T> {
        await this.initialize();

        const totalInputChars = messages.map(m => m.content).join('').length;
        IndentLogger.log(`Sending analysis request to AI (~${(totalInputChars / 1024).toFixed(1)} KB)`, 1);

        try {
            const { object } = await generateObject({
                model: this.model,
                messages,
                schema,
                maxTokens: this.config.maxTokens,
                temperature: this.config.temperature,
            });

            IndentLogger.log('AI analysis completed successfully', 1);
            return object;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            IndentLogger.log(`AI analysis failed: ${errorMessage}`, 1);
            throw new Error(`Indexing object generation failed: ${errorMessage}`);
        }
    }
}