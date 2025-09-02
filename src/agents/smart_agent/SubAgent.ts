import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { hasWriteOperations, ToolNames } from '../../tools/ToolRegistry.js';
import { z } from "zod";
import { SystemInfoEvent } from '../../events/EventTypes.js';
import { inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { tool } from 'ai';
import { SUB_AGENT_PROMPT, SubAgentResponse, SubAgentResponseSchema } from './SubAgentPrompt.js';
import { TaskExecutionResult, TerminateReason } from '../tool_agent/ToolAgent.js';
import { SecurityPolicyEngine } from '../../security/SecurityPolicyEngine.js';

interface SubAgentTask {
  id: string;
  type: string;
  description: string;
  context: any;
  preservationGuidance?: {
    attentionAreas: string[];
    expectedOutputs: string[];
  };
  maxTurns?: number;
  timeoutMs?: number;
}

export class SubAgent {
  private readonly MAX_TURNS = 20;
  private readonly DEFAULT_TIMEOUT = 300000;

  constructor(
    @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    @inject(TYPES.SecurityPolicyEngine) private securityEngine: SecurityPolicyEngine,
  ) { }

  async executeTask(task: SubAgentTask): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const maxTurns = this.MAX_TURNS;
    const timeout = this.DEFAULT_TIMEOUT;

    console.log(`SubAgent executing: ${task.type} - ${task.description}`);

    this.eventEmitter.emit({
      type: 'system_info',
      level: 'info',
      message: `SubAgent started: ${task.type}`,
      context: { taskId: task.id, maxTurns, timeout },
    } as SystemInfoEvent);

    try {
      const result = await Promise.race([
        this.executeTaskLoop(task, maxTurns),
        this.createTimeoutPromise(timeout)
      ]);

      const duration = Date.now() - startTime;

      this.eventEmitter.emit({
        type: 'system_info',
        level: result.terminateReason === 'FINISHED' ? 'info' : 'warning',
        message: `SubAgent ${result.terminateReason === 'FINISHED' ? 'completed' : 'failed'}: ${task.type}`,
        context: { taskId: task.id, duration },
      } as SystemInfoEvent);

      return {
        ...result,
        metadata: {
          ...result?.metadata,
          createdAt: startTime,
          duration: Date.now() - startTime,
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        terminateReason: 'ERROR',
        history: [],
        error: errorMessage,
        metadata: {
          createdAt: startTime,
          duration: Date.now() - startTime,
        }
      };
    }
  }

  private async executeTaskLoop(task: SubAgentTask, maxTurns: number): Promise<TaskExecutionResult> {
    const conversationHistory: Messages = [
      { role: 'system', content: SUB_AGENT_PROMPT },
    ];

    let currentObservation = `Task: ${task.description}
Context: ${JSON.stringify(task.context, null, 2)}
Preservation Guidance: ${JSON.stringify(task.preservationGuidance, null, 2)}
Complete this task efficiently.`;

    let turnCount = 0;
    let taskCompleted = false;

    while (!taskCompleted && turnCount < maxTurns) {
      turnCount++;

      try {
        const userMessage = { role: 'user' as const, content: `Current observation: ${currentObservation}` };
        conversationHistory.push(userMessage);

        const response = await this.toolAgent.generateObject<SubAgentResponse>({
          messages: conversationHistory,
          schema: SubAgentResponseSchema as z.ZodSchema<SubAgentResponse>,
        });

        const assistantMessage = { role: 'assistant' as const, content: JSON.stringify(response, null, 2) };
        conversationHistory.push(assistantMessage);

        // Check if task is finished
        if (response.finished) {
          taskCompleted = true;
          break;
        }

        const results = await Promise.allSettled(response.actions.map(action =>
          this.toolAgent.executeTool(action.tool, action.args)
            .then(result => `${action.tool}: ${JSON.stringify(result, null, 0)}`)
            .catch(error => `${action.tool}: ${error instanceof Error ? error.message : 'Unknown tool error'}`)
        ));

        currentObservation = `Previous actions: ${results.join('; ')}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        currentObservation = `Error occurred: ${errorMessage}`;

        // Don't break immediately, give it a chance to recover
        if (turnCount >= maxTurns - 2) break;
      }
    }

    let terminateReason: TerminateReason;
    if (taskCompleted) {
      terminateReason = 'FINISHED';
    } else if (turnCount >= maxTurns) {
      terminateReason = 'TIMEOUT';
    } else {
      terminateReason = 'ERROR';
    }

    const criticalHistory = this.filterCriticalHistory(conversationHistory);

    return {
      terminateReason,
      history: criticalHistory,
      error: terminateReason !== 'FINISHED' ? 'Task did not complete successfully' : undefined,
      metadata: {
        iterations: turnCount
      }
    };
  }

  private filterCriticalHistory(conversationHistory: Messages): Messages {
    const criticalHistory: Messages = [];

    // Always include system message
    if (conversationHistory[0]?.role === 'system') {
      criticalHistory.push(conversationHistory[0]);
    }

    // Filter messages based on criticalInfo flag and write operations
    for (let i = 1; i < conversationHistory.length; i++) {
      const message = conversationHistory[i];

      if (message.role === 'assistant') {
        try {
          const response = JSON.parse(message.content) as SubAgentResponse;
          const isCritical = response.criticalInfo || hasWriteOperations(response.actions || [], this.securityEngine);

          if (isCritical) {
            criticalHistory.push(message);
            // Also include the following user message if it exists
            if (conversationHistory[i + 1]?.role === 'user') {
              criticalHistory.push(conversationHistory[i + 1]);
            }
          }
        } catch {
          // If we can't parse, keep the message to be safe
          criticalHistory.push(message);
        }
      }
    }

    return criticalHistory;
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`SubAgent task timed out after ${timeoutMs}ms`)), timeoutMs);
    });
  }
}

export const createSubAgentTool = (toolAgent: ToolAgent, eventEmitter: UIEventEmitter, securityEngine: SecurityPolicyEngine) => {
  const startSubAgent = async (args: any): Promise<TaskExecutionResult> => {
    console.log('Starting sub-agent for specialized task');
    const subAgent = new SubAgent(toolAgent, eventEmitter, securityEngine);
    return await subAgent.executeTask(args);
  };

  return tool({
    description: `Start a specialized sub-agent for focused, autonomous task execution. Use this for:
- Complex, isolated tasks that can be completed independently
- Tasks requiring deep focus without user interaction
- Specialized operations that benefit from dedicated execution context
- When you need to delegate a specific subtask while continuing with the main workflow
The sub-agent will work autonomously until task completion or failure.`,
    inputSchema: z.object({
      taskType: z.string().describe('Type of task (e.g., "file_analysis", "code_refactor", "testing")'),
      description: z.string().describe('Clear description of what the sub-agent should accomplish'),
      context: z.any().optional().describe('Any relevant context or data needed for the task'),
      preservationGuidance: z.object({
        attentionAreas: z.array(z.string()).optional().describe('Areas to pay special attention to'),
        expectedOutputs: z.array(z.string()).optional().describe('Expected output types')
      }).optional().describe('Guidance on what areas to pay attention to')
    }),
    execute: async (args) => {
      const taskId = `subagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const task = {
        id: taskId,
        type: args.taskType,
        description: args.description,
        context: args.context || {},
        preservationGuidance: args.preservationGuidance
      };

      return await startSubAgent(task);
    }
  });
};