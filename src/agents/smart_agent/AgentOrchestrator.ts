import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { z } from "zod";

export const ContinuationDecisionSchema = z.object({
    shouldContinue: z.boolean(),
    reason: z.string(),
    confidence: z.number().min(0).max(100)
});

export type ContinuationDecision = z.infer<typeof ContinuationDecisionSchema>;

export const LoopDetectionSchema = z.object({
    isLoop: z.boolean(),
    confidence: z.number().min(0).max(100),
    description: z.string().optional()
});

export type LoopDetectionResult = z.infer<typeof LoopDetectionSchema>;

const CONTINUATION_PROMPT = `Analyze the assistant's last response to determine who should speak next.

**Decision Rules (apply in order):**
1. **Model Continues:** If the last response explicitly states a next action the assistant intends to take (e.g., "Next, I will...", "Now I'll process...", "Moving on to..."), OR if the response seems incomplete (cut off mid-thought), then the **model** should continue.

2. **Question to User:** If the last response ends with a direct question to the user, then the **user** should speak next.

3. **Default:** If the response completed a thought/task and doesn't meet criteria 1 or 2, then the **user** should speak next.

Respond with JSON: {"shouldContinue": boolean, "reason": "explanation", "confidence": 0-100}`;

const LOOP_DETECTION_PROMPT = `Check if the assistant is stuck in a repetitive loop by analyzing the last few assistant responses.

Look for:
- Repeating the same tools with same parameters
- Making no meaningful progress after 3+ similar actions
- Repeatedly encountering the same errors without adaptation

Only flag obvious, unproductive loops. Some repetition is normal when working systematically.

Respond with JSON: {"isLoop": boolean, "confidence": 0-100, "description": "optional explanation"}`;

export class AgentOrchestrator {
    constructor(
        private toolAgent: ToolAgent,
        private eventEmitter: UIEventEmitter
    ) { }

    async detectLoop(conversationHistory: Messages): Promise<LoopDetectionResult> {
        // Only check for loops if we have enough history
        if (conversationHistory.length < 6) {
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

    async shouldContinue(conversationHistory: Messages, currentObservation: string): Promise<boolean> {
        if (conversationHistory.length === 0) return false;

        // Find the last assistant message
        const lastAssistantMessage = conversationHistory
            .slice()
            .reverse()
            .find(msg => msg.role === 'assistant');

        if (!lastAssistantMessage) return false;

        const context = `Last assistant response: ${lastAssistantMessage.content}\nCurrent observation: ${currentObservation}`;

        try {
            const messages: Messages = [
                { role: 'system', content: CONTINUATION_PROMPT },
                { role: 'user', content: context }
            ];

            const decision = await this.toolAgent.generateObject({
                messages,
                schema: ContinuationDecisionSchema,
                allowTools: false
            });

            console.log(`Continuation: ${decision.shouldContinue ? 'Continue' : 'Wait'} - ${decision.reason}`);
            return decision.shouldContinue;
        } catch (error) {
            console.warn('Continuation check failed:', error);
            return false; // Default to waiting for user input
        }
    }
}