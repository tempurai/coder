import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { z } from "zod";
import { SystemInfoEvent } from '../../events/EventTypes.js';
import { inject } from 'inversify';
import { TYPES } from '../../di/types.js';

// Simplified schema and prompt
export const SubAgentResponseSchema = z.object({
    reasoning: z.string().describe("当前分析和计划的方法"),
    action: z.object({
        tool: z.string().describe("工具名称"),
        args: z.record(z.any()).default({})
    }),
    completed: z.boolean().default(false).describe("任务是否已完成"),
    output: z.any().optional().describe("完成时的最终结果")
});

export type SubAgentResponse = z.infer<typeof SubAgentResponseSchema>;

const SUB_AGENT_PROMPT = `You are a specialized SubAgent designed to complete a specific focused task autonomously. You operate in non-interactive mode, meaning you cannot ask the user for input or clarification.

# Operating Principles
- **Goal-Oriented**: Focus solely on completing the specified task efficiently
- **Self-Contained**: Work with only the provided context and available tools
- **Autonomous Decision Making**: Make informed decisions based on available information
- **Systematic Approach**: Break down complex tasks into logical steps
- **Error Resilience**: Handle errors gracefully with alternative approaches

# Execution Guidelines
1. **Analyze the Task**: Understand the objective, context, and available tools
2. **Plan Your Approach**: Determine the sequence of actions needed
3. **Execute Systematically**: Use tools methodically to accomplish the goal
4. **Adapt as Needed**: Adjust your approach based on tool results and obstacles
5. **Verify Progress**: Ensure each action contributes toward the goal
6. **Complete Thoroughly**: Don't finish until the objective is fully met

# Tool Usage
- Validate tool availability before attempting to use restricted tools
- Handle tool errors by trying alternative approaches or modified parameters
- Use tool results to inform subsequent actions
- Prefer specific, targeted tool calls over broad, unfocused ones

# Quality Standards
- Produce accurate, high-quality results that meet the task requirements
- Follow established code conventions and patterns when working with code
- Document your reasoning for complex decisions
- Ensure completeness - don't leave tasks partially finished

# Response Format
Always respond with valid JSON:
{
  "reasoning": "Detailed explanation of your current analysis, what you've learned, and your planned approach",
  "action": {
    "tool": "exact_tool_name",
    "args": { "parameter": "value" }
  },
  "completed": false,
  "output": null
}

**When to Set "completed": true:**
- The specific task objective has been fully accomplished
- All requirements have been met
- Any verification steps have been completed successfully
- Include your final results/deliverables in the "output" field

**Special Actions:**
- Use "tool": "think" for pure reasoning when no tool execution is needed
- Use "tool": "finish" to explicitly signal task completion

Remember: You are operating independently to accomplish a specific goal. Focus on delivering results efficiently and effectively while maintaining high quality standards.`;

// Interfaces
interface SubAgentTask {
    id: string;
    type: string;
    description: string;
    context: any;
    tools?: string[];
    maxTurns?: number;
    timeoutMs?: number;
}

interface SubAgentResult {
    success: boolean;
    taskId: string;
    output: any;
    iterations: number;
    duration: number;
    terminateReason: 'GOAL' | 'MAX_TURNS' | 'TIMEOUT' | 'ERROR';
    error?: string;
    logs: string[];
}

export class SubAgent {
    private readonly MAX_TURNS = 20;
    private readonly DEFAULT_TIMEOUT = 300000;

    constructor(
        @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    ) { }

    async executeTask(task: SubAgentTask): Promise<SubAgentResult> {
        const startTime = Date.now();
        const logs: string[] = [];
        const maxTurns = task.maxTurns || this.MAX_TURNS;
        const timeout = task.timeoutMs || this.DEFAULT_TIMEOUT;

        logs.push(`Starting SubAgent task: ${task.type}`);
        console.log(`SubAgent executing: ${task.type} - ${task.description}`);

        // Emit start event
        this.eventEmitter.emit({
            type: 'system_info',
            level: 'info',
            message: `SubAgent started: ${task.type}`,
            context: { taskId: task.id, maxTurns, timeout },
        } as SystemInfoEvent);

        try {
            const result = await Promise.race([
                this.executeTaskLoop(task, maxTurns, logs),
                this.createTimeoutPromise(timeout)
            ]);

            const duration = Date.now() - startTime;
            logs.push(`Task ${result.success ? 'completed' : 'failed'} in ${duration}ms`);

            // Emit completion event
            this.eventEmitter.emit({
                type: 'system_info',
                level: result.success ? 'info' : 'warning',
                message: `SubAgent ${result.success ? 'completed' : 'failed'}: ${task.type}`,
                context: { taskId: task.id, duration, iterations: result.iterations },
            } as SystemInfoEvent);

            return { ...result, taskId: task.id, duration, logs };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logs.push(`Task failed with error: ${errorMessage}`);

            return {
                success: false,
                taskId: task.id,
                output: null,
                iterations: 0,
                duration,
                terminateReason: 'ERROR',
                error: errorMessage,
                logs
            };
        }
    }

    private async executeTaskLoop(task: SubAgentTask, maxTurns: number, logs: string[]) {
        const toolsList = task.tools ? task.tools.join(', ') : 'all available tools';

        const conversationHistory: Messages = [
            { role: 'system', content: SUB_AGENT_PROMPT },
            {
                role: 'user',
                content: `# Current Task Specification
**Task Type**: ${task.type}
**Description**: ${task.description}
**Available Tools**: ${toolsList}
**Context**: ${JSON.stringify(task.context, null, 2)}

Complete this task by accomplishing the objective described above. When finished, set "completed": true and include your final results in the "output" field.`
            }
        ];

        let currentObservation = `Task: ${task.description}\nType: ${task.type}\nContext: ${JSON.stringify(task.context, null, 2)}`;
        let turnCount = 0;
        let taskCompleted = false;
        let finalOutput: any = null;

        while (!taskCompleted && turnCount < maxTurns) {
            turnCount++;
            logs.push(`Turn ${turnCount}: Processing observation`);

            try {
                conversationHistory.push({
                    role: 'user',
                    content: `Current observation: ${currentObservation}`
                });

                const response = await this.toolAgent.generateObject<SubAgentResponse>({
                    messages: conversationHistory,
                    schema: SubAgentResponseSchema as z.ZodSchema<SubAgentResponse>,
                    allowTools: false
                });

                conversationHistory.push({
                    role: 'assistant',
                    content: JSON.stringify(response, null, 2)
                });

                logs.push(`Turn ${turnCount}: ${response.action.tool}`);

                if (response.completed || response.action.tool === 'finish') {
                    taskCompleted = true;
                    finalOutput = response.output || response.action.args;
                    break;
                }

                if (response.action.tool === 'think') {
                    currentObservation = `Previous: Reasoning completed\nThought: ${response.reasoning}`;
                    continue;
                }

                // Check tool restrictions
                if (task.tools && !task.tools.includes(response.action.tool)) {
                    currentObservation = `Error: Tool ${response.action.tool} is not available for this specialized task`;
                    continue;
                }

                // Execute tool
                try {
                    const toolResult = await this.toolAgent.executeTool(response.action.tool, response.action.args);
                    currentObservation = `Previous: ${response.action.tool}\nResult: ${JSON.stringify(toolResult, null, 2)}`;
                } catch (toolError) {
                    const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown tool error';
                    currentObservation = `Previous: ${response.action.tool}\nError: ${errorMessage}`;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logs.push(`Turn ${turnCount}: Error: ${errorMessage}`);
                currentObservation = `Error occurred: ${errorMessage}`;
                if (turnCount >= maxTurns - 2) break;
            }
        }

        let terminateReason: 'GOAL' | 'MAX_TURNS' | 'ERROR';
        if (taskCompleted) {
            terminateReason = 'GOAL';
        } else if (turnCount >= maxTurns) {
            terminateReason = 'MAX_TURNS';
        } else {
            terminateReason = 'ERROR';
        }

        return {
            success: taskCompleted,
            output: finalOutput,
            iterations: turnCount,
            terminateReason
        };
    }

    private createTimeoutPromise(timeoutMs: number): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`SubAgent task timed out after ${timeoutMs}ms`)), timeoutMs);
        });
    }
}