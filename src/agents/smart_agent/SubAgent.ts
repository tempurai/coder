import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { ToolNames } from '../../tools/ToolRegistry.js';
import { z } from "zod";
import { SystemInfoEvent } from '../../events/EventTypes.js';
import { inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { tool } from 'ai';
import { SUB_AGENT_PROMPT, SubAgentResponse, SubAgentResponseSchema } from './SubAgentPrompt.js';

interface SubAgentTask {
  id: string;
  type: string;
  description: string;
  context: any;
  contextGuidance?: {
    focusAreas: string[];
    criticalTypes: string[];
    expectedOutputs: string[];
  };
  tools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
}

interface SubAgentResult {
  success: boolean;
  taskId: string;
  output: any;
  iterations: number;
  criticalInfo: string;
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
    const maxTurns = this.MAX_TURNS;
    const timeout = this.DEFAULT_TIMEOUT;

    logs.push(`Starting SubAgent task: ${task.type}`);
    console.log(`SubAgent executing: ${task.type} - ${task.description}`);

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
        criticalInfo: `Task failed: ${errorMessage}`,
        duration,
        terminateReason: 'ERROR',
        error: errorMessage,
        logs
      };
    }
  }

  private async executeTaskLoop(task: SubAgentTask, maxTurns: number, logs: string[]) {
    const criticalInfoList: string[] = [];
    const conversationHistory: Messages = [
      { role: 'system', content: SUB_AGENT_PROMPT },
      {
        role: 'user',
        content: `Task: ${task.description}
Context: ${JSON.stringify(task.context, null, 2)}
Complete this task efficiently.`
          + (task.contextGuidance ? `
Context Guidance: ${JSON.stringify(task.contextGuidance, null, 2)}` : '')
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
        });

        conversationHistory.push({
          role: 'assistant',
          content: JSON.stringify(response, null, 2)
        });

        logs.push(`Turn ${turnCount}: ${response.action.tool}`);

        if (response.criticalInfo) {
          criticalInfoList.push(response.criticalInfo);
        }

        if (response.completed || response.action.tool === 'finish') {
          taskCompleted = true;
          finalOutput = response.output || response.action.args;
          break;
        }

        if (response.action.tool === 'think') {
          currentObservation = `Previous: Reasoning completed\nThought: ${response.reasoning}`;
          continue;
        }

        if (task.tools && !task.tools.includes(response.action.tool)) {
          currentObservation = `Error: Tool ${response.action.tool} is not available for this specialized task`;
          continue;
        }

        try {
          const toolResult = await this.toolAgent.executeTool(response.action.tool, response.action.args);
          currentObservation = `Previous: ${response.action.tool}\nResult: ${JSON.stringify(toolResult, null, 2)}`;

          if (this.shouldPreserveTool(response.action.tool, toolResult)) {
            const info = this.summarizeResult(response.action.tool, toolResult);
            criticalInfoList.push(info);
          }
        } catch (toolError) {
          const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown tool error';
          currentObservation = `Previous: ${response.action.tool}\nError: ${errorMessage}`;

          criticalInfoList.push(`ERROR ${response.action.tool}: ${errorMessage}`);
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

    const criticalInfo = criticalInfoList.join('\n');

    return {
      success: taskCompleted,
      output: finalOutput,
      criticalInfo,
      iterations: turnCount,
      terminateReason
    };
  }

  private shouldPreserveTool(toolName: string, result: any): boolean {
    if ([ToolNames.WRITE_FILE, ToolNames.APPLY_PATCH].includes(toolName)) {
      return true;
    }

    if (!result.success) {
      return true;
    }

    if (toolName === ToolNames.SHELL_EXECUTOR || toolName === ToolNames.MULTI_COMMAND) {
      return result.commandClassification && !result.commandClassification.isReadOnly;
    }

    return false;
  }

  private summarizeResult(toolName: string, result: any): string {
    if (!result.success) {
      return `ERROR ${toolName}: ${result.error}`;
    }

    switch (toolName) {
      case ToolNames.WRITE_FILE:
        return `Wrote file: ${result.filePath}`;
      case ToolNames.APPLY_PATCH:
        return `Applied patch to: ${result.filePath}`;
      case ToolNames.SHELL_EXECUTOR:
        return `Executed (${result.commandClassification?.category}): ${result.command}`;
      default:
        return `${toolName}: completed`;
    }
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`SubAgent task timed out after ${timeoutMs}ms`)), timeoutMs);
    });
  }
}

export const createSubAgentTool = (toolAgent: ToolAgent, eventEmitter: UIEventEmitter) => {
  const startSubAgent = async (args: any): Promise<any> => {
    console.log('Starting sub-agent for specialized task');
    const subAgent = new SubAgent(toolAgent, eventEmitter);
    return await subAgent.executeTask({
      ...args,
      contextGuidance: args.contextGuidance || {
        focusAreas: ['file_changes', 'errors', 'build_results'],
        criticalTypes: ['write_operations', 'error_messages'],
        expectedOutputs: ['modified_files', 'error_details']
      }
    });
  }

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
      contextGuidance: z.object({
        focusAreas: z.array(z.string()).optional().describe('Areas to pay special attention to'),
        criticalTypes: z.array(z.string()).optional().describe('Types of information to preserve'),
        expectedOutputs: z.array(z.string()).optional().describe('Expected output types')
      }).optional().describe('Guidance on what context information to preserve')
    }),
    execute: async (args) => {
      const taskId = `subagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const task = {
        id: taskId,
        type: args.taskType,
        description: args.description,
        context: args.context || {},
        contextGuidance: args.contextGuidance
      };

      try {
        const result = await startSubAgent(task);
        return {
          success: result.success,
          taskId: result.taskId,
          output: result.output,
          iterations: result.iterations,
          duration: result.duration,
          criticalInfo: result.criticalInfo,
          terminateReason: result.terminateReason,
          error: result.error,
          message: result.success
            ? `Sub-agent completed task "${args.taskType}" successfully in ${result.iterations} iterations`
            : `Sub-agent failed: ${result.error}`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: `Sub-agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}