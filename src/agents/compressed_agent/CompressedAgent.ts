import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { encode } from 'gpt-tokenizer';
import { z, ZodSchema } from 'zod';

const CompressionResultSchema = z.object({
    overall_goals: z.string().describe("Updated list of main objectives the user is trying to achieve"),
    key_knowledge: z.string().describe("Important facts, file paths, commands, configurations, project insights"),
    file_changes: z.string().describe("Files that were read, modified, created, or are important"),
    task_progress: z.string().describe("What has been completed, what's in progress, next steps"),
    recent_outcomes: z.string().describe("Results of recent actions, errors, discoveries, current state")
});

type CompressionResult = z.infer<typeof CompressionResultSchema>;

const COMPRESSION_PROMPT = `You are a specialized context compression agent. Your task is to merge existing compressed context with new conversation history into a single, updated compressed summary.

You will receive:
1. An existing compressed context (may be empty for first compression)
2. New conversation history that needs to be integrated

Create an updated compressed context by analyzing all the information and responding with a JSON object containing these fields:
- overall_goals: Updated list of main objectives the user is trying to achieve
- key_knowledge: Important facts, file paths, commands, configurations, project insights
- file_changes: Files that were read, modified, created, or are important
- task_progress: What has been completed, what's in progress, next steps
- recent_outcomes: Results of recent actions, errors, discoveries, current state

Rules:
- Merge information from existing context with new history
- Update progress and outcomes based on new information
- Remove outdated information that's no longer relevant
- Keep all essential details needed for future task execution
- Be extremely concise but comprehensive
- Output ONLY valid JSON, no other text

Example output:
{
 "overall_goals": "Implement JWT authentication system, refactor user management API",
 "key_knowledge": "Project uses Express.js with TypeScript, JWT library is 'jsonwebtoken', user model in /models/User.ts, API endpoints in /routes/auth.ts",
 "file_changes": "MODIFIED: /routes/auth.ts - added JWT middleware, READ: /models/User.ts - analyzed user schema, CREATED: /middleware/auth.ts - JWT verification",
 "task_progress": "COMPLETED: JWT middleware implementation, IN_PROGRESS: user registration endpoint, TODO: password reset functionality",
 "recent_outcomes": "JWT middleware working correctly, tests passing, discovered bcrypt dependency needed for password hashing"
}`;

@injectable()
export class CompressedAgent {
    constructor(
        @inject(TYPES.ToolAgent) private toolAgent: ToolAgent
    ) { }

    calculateTokens(messages: Messages): number {
        const text = messages.map(m => m.content).join('');
        return encode(text).length;
    }

    async compress(existingCompressedContext: string, newHistory: Messages): Promise<string> {
        if (newHistory.length === 0) {
            return existingCompressedContext;
        }

        const historyText = JSON.stringify(newHistory, null, 2);
        const compressionContext = existingCompressedContext
            ? `Existing compressed context:\n${existingCompressedContext}\n\n`
            : '';

        const prompt = `${compressionContext}New conversation history to integrate:\n${historyText}`;

        try {
            const messages: Messages = [
                { role: 'system', content: COMPRESSION_PROMPT },
                { role: 'user', content: prompt }
            ];

            const compressionResult = await this.toolAgent.generateObject<CompressionResult>({
                messages,
                schema: CompressionResultSchema as ZodSchema<CompressionResult>,
                allowTools: false
            });

            return JSON.stringify(compressionResult, null, 2);

        } catch (error) {
            console.error('Context compression failed:', error);
            return existingCompressedContext;
        }
    }
}