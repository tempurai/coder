import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { CompressedAgent } from '../agents/compressed_agent/CompressedAgent.js';
import { Messages } from '../agents/tool_agent/ToolAgent.js';
import { encode } from 'gpt-tokenizer';

@injectable()
export class CompressorService {
    private readonly maxTokens = 30000;
    private readonly preserveRecentCount = 8;
    private readonly intelligentThreshold = 0.85; // 85% threshold for AI decision
    private readonly forceThreshold = 0.95; // 95% threshold for forced compression
    private readonly minCompressionInterval = 30000; // 30 seconds
    public lastCompressionTime: number = 0;

    constructor(
        @inject(TYPES.CompressedAgent) private compressedAgent: CompressedAgent,
    ) { }

    async compressContextIfNeeded(history: Messages): Promise<Messages> {
        if (history.length <= this.preserveRecentCount) {
            return history
        }

        const totalTokens = this.calculateTokens(history);

        // Force compression if token count is too high
        if (totalTokens > this.maxTokens * this.forceThreshold) {
            console.log(`强制压缩触发 (${totalTokens} tokens)`);
            return await this.performCompression(history);
        }

        // For moderate token usage, check timing and ask AI
        if (totalTokens > this.maxTokens * this.intelligentThreshold) {
            const timeSinceLastCompression = Date.now() - this.lastCompressionTime;
            if (timeSinceLastCompression < this.minCompressionInterval) {
                return history
            }

            const shouldCompress = await this.compressedAgent.shouldCompress(totalTokens, history);

            if (shouldCompress) {
                console.log(`AI建议压缩 (${totalTokens} tokens)`);
                return await this.performCompression(history);
            }
        }

        return history
    }

    private async performCompression(history: Messages): Promise<Messages> {
        const toCompress = history.slice(0, -this.preserveRecentCount);
        const toKeep = history.slice(-this.preserveRecentCount);

        const compressed = await this.compressedAgent.compress(
            toCompress
        );

        this.lastCompressionTime = Date.now();

        let compressedHistory = [...compressed, ...toKeep];
        return compressedHistory;
    }

    private calculateTokens(messages: Messages): number {
        const text = messages.map(m => m.content).join('');
        return encode(text).length;
    }
}