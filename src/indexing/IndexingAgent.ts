import { generateObject, generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { getContainer } from '../di/container.js';
import { TYPES } from '../di/types.js';
import type { Config } from '../config/ConfigLoader.js';
import { ZodSchema } from 'zod';

export type IndexingMessage = { role: 'system' | 'user' | 'assistant', content: string };
export type IndexingMessages = IndexingMessage[];

export class IndexingAgent {
    private model: LanguageModel;
    private config: Config;

    constructor() {
        const container = getContainer();
        this.model = container.get<LanguageModel>(TYPES.LanguageModel);
        this.config = container.get<Config>(TYPES.Config);
    }

    async generateText(messages: IndexingMessages): Promise<string> {
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