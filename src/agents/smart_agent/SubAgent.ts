import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { hasWriteOperations, ToolNames } from '../../tools/ToolRegistry.js';
import { z } from "zod";
import { SystemInfoEvent, TextGeneratedEvent, ThoughtGeneratedEvent } from '../../events/EventTypes.js';
import { inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { tool } from 'ai';
import { SUB_AGENT_PROMPT, SubAgentResponse, SubAgentResponseFinished, SubAgentResponseSchema } from './SubAgentPrompt.js';
import { TaskExecutionResult, TerminateReason } from '../tool_agent/ToolAgent.js';
import { SecurityPolicyEngine } from '../../security/SecurityPolicyEngine.js';
import { InterruptService } from '../../services/InterruptService.js';
import { ToolInterceptor } from './ToolInterceptor.js';
import { getContainer } from '../../di/container.js';

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
  private readonly maxIterations = 20;
  private readonly executionTimeout = 300000;
  private memory: Messages = [];

  constructor(
    @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    @inject(TYPES.InterruptService) private interruptService: InterruptService,
    @inject(TYPES.SecurityPolicyEngine) private securityEngine: SecurityPolicyEngine,
    @inject(TYPES.ToolInterceptor) private toolInterceptor: ToolInterceptor,
  ) { }

  async executeTask(task: SubAgentTask): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const maxTurns = this.maxIterations;
    const timeout = this.executionTimeout;

    console.log(`SubAgent executing: ${task.type} - ${task.description}`);
    this.eventEmitter.emit({
      type: 'system_info',
      level: 'info',
      message: `SubAgent started: ${task.type}`,
      context: { taskId: task.id, maxTurns, timeout },
    } as SystemInfoEvent);

    try {
      const result = await Promise.race([
        this.executeMainLoop(task, maxTurns),
        this.createTimeoutHandler(timeout)
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

  private async executeMainLoop(task: SubAgentTask, maxTurns: number): Promise<TaskExecutionResult> {
    this.memory = [
      { role: 'system', content: SUB_AGENT_PROMPT },
      {
        role: "user", content: `Task: ${task.description}
Context: ${JSON.stringify(task.context, null, 2)}
Preservation Guidance: ${JSON.stringify(task.preservationGuidance, null, 2)}
Complete this task efficiently.`
      }
    ];

    let currentIteration = 0;
    let isCompleted = false;

    while (!isCompleted && currentIteration < maxTurns) {
      if (this.interruptService.isInterrupted()) {
        console.log('Task execution interrupted by user');
        return {
          terminateReason: 'INTERRUPTED',
          history: this.processHistory(),
          metadata: {
            iterations: currentIteration,
          }
        };
      }

      currentIteration++;

      const { response, error } = await this.executeSingleIteration(currentIteration);

      if (response.finished) {
        this.eventEmitter.emit({ type: 'text_generated', text: response.result, } as TextGeneratedEvent);
        isCompleted = true;
        break;
      }

      if (error && currentIteration >= maxTurns - 2) break;
    }

    let terminateReason: TerminateReason;
    if (isCompleted) {
      terminateReason = 'FINISHED';
    } else if (currentIteration >= maxTurns) {
      terminateReason = 'TIMEOUT';
    } else {
      terminateReason = 'ERROR';
    }

    const criticalHistory = this.processHistory();

    return {
      terminateReason,
      history: criticalHistory,
      error: terminateReason !== 'FINISHED' ? 'Task did not complete successfully' : undefined,
      metadata: {
        iterations: currentIteration
      }
    };
  }

  private async executeSingleIteration(currentIteration: number): Promise<{ response: SubAgentResponse; error?: string }> {
    try {
      const response = await this.toolAgent.generateObject<SubAgentResponse>({
        messages: this.memory,
        schema: SubAgentResponseSchema as z.ZodSchema<SubAgentResponse>,
      });

      const assistantMessage = { role: 'assistant' as const, content: JSON.stringify(response, null, 2) };
      this.memory.push(assistantMessage);

      if (response.finished) {
        return { response };
      }

      this.eventEmitter.emit({ type: 'thought_generated', iteration: currentIteration, thought: response.reasoning } as ThoughtGeneratedEvent);

      const toolResults = [];
      for (const action of response.actions) {
        const toolResult = await this.toolInterceptor.executeToolSafely(currentIteration, action);
        toolResults.push(JSON.stringify(toolResult.result, null, 0) || toolResult.error);
      }

      this.memory.push({
        role: "user", content: `Actions Results: ${JSON.stringify(toolResults, null, 0)}`
      });

      return { response };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Sub Agent Iteration ${currentIteration} failed: ${errorMessage}`);

      const response = { reasoning: 'Iteration error occurred', actions: [], finished: true, result: "", criticalInfo: true } as SubAgentResponseFinished;
      this.memory.push({ role: 'user', content: `Observation: ${response}` });

      return {
        response: { reasoning: 'Iteration error occurred', actions: [], finished: true, result: "" } as any,
        error: errorMessage
      };
    }
  }

  private processHistory(): Messages {
    const criticalHistory: Messages = [];

    if (this.memory[0]?.role === 'system') {
      criticalHistory.push(this.memory[0]);
    }

    for (let i = 1; i < this.memory.length; i++) {
      const message = this.memory[i];
      if (message.role === 'assistant') {
        try {
          const response = JSON.parse(message.content) as SubAgentResponse;
          const isCritical = response.criticalInfo || hasWriteOperations(response.actions || [], this.securityEngine);
          if (isCritical) {
            criticalHistory.push(message);
            if (this.memory[i + 1]?.role === 'user') {
              criticalHistory.push(this.memory[i + 1]);
            }
          }
        } catch {
          criticalHistory.push(message);
        }
      }
    }

    return criticalHistory;
  }

  private createTimeoutHandler(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`SubAgent task timed out after ${timeoutMs}ms`)), timeoutMs);
    });
  }
}

export const createSubAgentTool = () => {
  const startSubAgent = async (args: any): Promise<TaskExecutionResult> => {
    console.log('Starting sub-agent for specialized task');
    const subAgent = getContainer().get<SubAgent>(TYPES.SubAgent);
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