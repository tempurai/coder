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
    recent_outcomes: z.string().describe("Results of recent actions, errors, discoveries, current state"),
    context_quality: z.enum(['high', 'medium', 'low']).describe("Assessment of how much critical information was preserved")
});

const CompressionDecisionSchema = z.object({
    should_compress: z.boolean().describe("Whether compression is recommended based on current context"),
    reasoning: z.string().describe("Explanation for the compression decision"),
    confidence: z.enum(['high', 'medium', 'low']).describe("Confidence level in this decision")
});

type CompressionResult = z.infer<typeof CompressionResultSchema>;
type CompressionDecision = z.infer<typeof CompressionDecisionSchema>;

const COMPRESSION_DECISION_PROMPT = `You are analyzing conversation context to determine if compression is needed.

Your task is to evaluate whether the current conversation history should be compressed based on:
- **Information Density**: Are there repetitive tool calls, verbose outputs, or redundant information?
- **Task Progression**: Is the conversation moving toward completion or still actively developing?
- **Context Value**: Would compressing now lose important working context vs preserving completed information?
- **Conversation Flow**: Is this a natural break point where compression would be beneficial?

# Decision Guidelines
**Recommend compression when:**
- Conversation contains completed tasks with lots of intermediate steps/outputs
- Many repetitive tool calls with similar results
- Clear task boundaries where previous context can be summarized
- Information that can be condensed without losing essential details

**Avoid compression when:**
- Currently in the middle of complex, ongoing work
- Recent context contains unresolved errors or partial solutions
- Working state that might be needed for next steps
- User seems to be building on recent specific details

Respond with JSON:
{
  "should_compress": true/false,
  "reasoning": "Clear explanation of your decision",
  "confidence": "high/medium/low"
}`;

const COMPRESSION_PROMPT = `You are a specialized context compression agent. Your task is to merge existing compressed context with new conversation history into a single, updated compressed summary that preserves maximum utility for future development tasks.

You will receive:
1. An existing compressed context (may be empty for first compression)
2. New conversation history that needs to be integrated

Your goal is to create a comprehensive yet concise summary that maintains ALL critical information needed for continued software engineering work.

# Critical Information to Preserve
- **Development Context**: Current project structure, key files, technologies used
- **Task State**: What the user is trying to achieve, current progress, blockers
- **Technical Details**: Important configurations, dependencies, patterns discovered
- **Decision History**: Why certain approaches were chosen, what was tried and failed
- **File Changes**: Specific files modified, created, or analyzed with their purposes
- **Tool Usage Patterns**: Successful workflows, problematic areas, optimization opportunities

# Compression Strategy
- **Merge, Don't Replace**: Integrate new information with existing context
- **Prioritize Actionable Information**: Keep details that directly impact future decisions
- **Preserve Context Chains**: Maintain logical connections between related information
- **Update Status**: Reflect current state accurately based on latest information
- **Remove Redundancy**: Eliminate duplicate information but keep unique perspectives

Create an updated compressed context by analyzing all the information and responding with a JSON object containing these fields:
- overall_goals: Updated list of main objectives the user is trying to achieve
- key_knowledge: Important facts, file paths, commands, configurations, project insights
- file_changes: Files that were read, modified, created, or are important
- task_progress: What has been completed, what's in progress, next steps
- recent_outcomes: Results of recent actions, errors, discoveries, current state
- context_quality: Your assessment of information preservation (high/medium/low)

Rules:
- Merge information from existing context with new history intelligently
- Update progress and outcomes based on new information while preserving historical context
- Keep essential details but remove verbose logs and repetitive content
- Maintain technical precision - preserve exact file paths, command syntax, error messages
- Be comprehensive yet concise - aim for maximum information density
- Output ONLY valid JSON, no other text

Example output:
{
 "overall_goals": "Implement JWT authentication system, refactor user management API to support role-based access",
 "key_knowledge": "Project uses Express.js v4.18 with TypeScript, PostgreSQL database, JWT library 'jsonwebtoken' v9.0. User model in /src/models/User.ts has fields: id, email, role, hashedPassword. API endpoints in /src/routes/auth.ts. Current auth middleware in /src/middleware/auth.ts uses session-based auth.",
 "file_changes": "MODIFIED: /src/routes/auth.ts - added JWT login endpoint, MODIFIED: /src/middleware/auth.ts - replaced session with JWT verification, READ: /src/models/User.ts - analyzed user schema for JWT payload, CREATED: /src/utils/jwt.ts - JWT utility functions, READ: package.json - confirmed jsonwebtoken dependency exists",
 "task_progress": "COMPLETED: JWT middleware implementation and testing, COMPLETED: login endpoint with JWT generation, IN_PROGRESS: role-based access control implementation, TODO: password reset functionality with JWT tokens, TODO: refresh token mechanism",
 "recent_outcomes": "JWT middleware working correctly with Bearer token authentication, all existing tests passing, discovered need for role field in JWT payload for authorization, identified security concern with token expiration handling - implemented 1-hour expiry with refresh token plan",
 "context_quality": "high"
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

    async shouldCompress(totalTokens: number, history: Messages): Promise<boolean> {
        if (history.length < 20) {
            return false; // Not enough history to evaluate
        }

        const contextInfo = {
            totalTokens: totalTokens,
            recentHistoryLength: history.length,
            recentMessages: history.slice(-20).map(m => ({
                role: m.role,
                contentPreview: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
            }))
        };

        const prompt = `Context to evaluate:\n${JSON.stringify(contextInfo, null, 2)}`;

        try {
            const messages: Messages = [
                { role: 'system', content: COMPRESSION_DECISION_PROMPT },
                { role: 'user', content: prompt }
            ];

            const decision = await this.toolAgent.generateObject<CompressionDecision>({
                messages,
                schema: CompressionDecisionSchema as ZodSchema<CompressionDecision>,
                allowTools: false
            });

            console.log(`压缩决策: ${decision.should_compress} (${decision.confidence} confidence) - ${decision.reasoning}`);

            return decision.should_compress;
        } catch (error) {
            console.error('Compression decision failed:', error);

            // Fallback: compress if history is getting long
            return history.length > 15;
        }
    }

    async compress(history: Messages): Promise<Messages> {
        if (history.length === 0) {
            return history;
        }

        const historyText = JSON.stringify(history, null, 0);
        const prompt = `history to compress:\n${historyText}`;

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

            // Log compression quality for monitoring
            console.log(`📝 Context compressed with ${compressionResult.context_quality} quality preservation`);

            const newMessages: Messages = [
                { role: 'user', content: `This is compressed message: ${JSON.stringify(compressionResult, null, 0)}` }
            ];

            return newMessages;
        } catch (error) {
            console.error('Context compression failed:', error);

            // Fallback: return existing context if compression fails
            return history;
        }
    }
}