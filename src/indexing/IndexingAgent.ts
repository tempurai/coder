import { generateObject, generateText } from 'ai';
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

    async initialize(): Promise<void> {
        if (this.initialized) return;

        const container = getContainer();
        this.model = await container.getAsync<LanguageModel>(TYPES.LanguageModel);
        this.config = container.get<Config>(TYPES.Config);
        this.initialized = true;
    }

    async generateText(messages: IndexingMessages): Promise<string> {
        await this.initialize();

        try {
            const result = await generateText({
                model: this.model,
                messages,
                maxOutputTokens: this.config.maxTokens,
                temperature: this.config.temperature,
            });
            return result.text;
        } catch (error) {
            throw new Error(`Indexing text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async generateObject<T>(messages: IndexingMessages, schema: ZodSchema<T>): Promise<T> {
        await this.initialize();

        try {
            const result = await generateObject({
                model: this.model,
                messages,
                schema,
                maxTokens: this.config.maxTokens,
                temperature: this.config.temperature,
            });
            return result.object;
        } catch (error) {
            throw new Error(`Indexing object generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}