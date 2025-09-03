import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { z } from "zod";
import { inject } from 'inversify';
import { TYPES } from '../../di/types.js';

export const LoopDetectionSchema = z.object({
    isLoop: z.boolean(),
    confidence: z.number().min(0).max(100),
    description: z.string().optional()
});

export type LoopDetectionResult = z.infer<typeof LoopDetectionSchema>;

const LOOP_DETECTION_PROMPT = `Check if the assistant is stuck in a repetitive loop by analyzing the last few assistant responses.

**IMPORTANT: Be less strict about loops during planning phases. Look for:**
- Repeating the same tools with identical parameters AND getting identical results with no progress
- Making the same exact errors repeatedly without adaptation
- Stuck in the same reasoning pattern for 3+ iterations with no advancement

**NOT loops:**
- Using todo_manager multiple times during initial planning (this is normal workflow)
- Reading multiple related files during investigation
- Trying different approaches to solve a problem
- Systematic execution of a plan with clear progress

**Only flag as loops when:**
1. Same tool + same parameters + same results repeated 3+ times
2. Clear evidence of no progress toward the goal
3. Identical reasoning patterns with no new insights

Respond with JSON: {"isLoop": boolean, "confidence": 0-100, "description": "optional explanation"}`;

export class AgentOrchestrator {
    constructor(
        @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    ) { }

    async detectLoop(conversationHistory: Messages): Promise<LoopDetectionResult> {
        // Only check for loops if we have enough history
        if (conversationHistory.length < 8) {
            return { isLoop: false, confidence: 0 };
        }

        // Get recent assistant messages
        const recentAssistantMessages = conversationHistory
            .filter(turn => turn.role === 'assistant')
            .slice(-4); // Last 4 assistant turns

        if (recentAssistantMessages.length < 3) {
            return { isLoop: false, confidence: 0 };
        }

        const historyText = recentAssistantMessages
            .map((msg, i) => `Response ${i + 1}: ${msg.content}`)
            .join('\n---\n');

        try {
            const messages: Messages = [
                { role: 'system', content: LOOP_DETECTION_PROMPT },
                { role: 'user', content: `Recent assistant responses:\n${historyText}` }
            ];

            return await this.toolAgent.generateObject({
                messages,
                schema: LoopDetectionSchema,
                allowTools: false
            });
        } catch (error) {
            console.warn('Loop detection failed:', error);
            return {
                isLoop: false,
                confidence: 0,
                description: 'Loop detection failed'
            };
        }
    }
}