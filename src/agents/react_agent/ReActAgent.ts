import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { ToolAgent } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import {
  UIEventType,
  ReActIterationStartedEvent,
  ThoughtGeneratedEvent,
  ActionSelectedEvent,
  ToolCallStartedEvent,
  ToolCallCompletedEvent,
  ObservationMadeEvent
} from '../../events/EventTypes.js';
import { subTaskAgentPrompts } from './SubTasksAgent.js';


interface ReActIteration {
  iteration: number;
  observation: string;
  thought: string;
  action: {
    agent: string;
    tool: string;
    args: any;
    result?: any;
    error?: string;
  };
  finished: boolean;
}

interface TaskResult {
  success: boolean;
  taskDescription: string;
  summary: string;
  iterations: number;
  duration: number;
  error?: string;
  history: ReActIteration[];
}

interface AgentResponse {
  reasoning: string;
  action: {
    tool: string;
    args: any;
  };
  agent_needed?: 'query' | 'code' | 'analysis' | 'system';
}

export class ReActAgent {
  private maxIterations: number;
  private conversationHistory: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [];

  constructor(
    private toolAgent: ToolAgent,
    private eventEmitter: UIEventEmitter,
    maxIterations: number = 15
  ) {
    this.maxIterations = maxIterations;
    console.log('ReAct Agent initialized');
  }

  async runTask(initialQuery: string): Promise<TaskResult> {
    const startTime = Date.now();
    const history: ReActIteration[] = [];
    this.conversationHistory = [];

    try {
      let iteration = 0;
      let currentObservation = `Task: ${initialQuery}`;
      let finished = false;
      let currentAgent = 'query'; // Start with query for most tasks

      while (!finished && iteration < this.maxIterations) {
        iteration++;
        console.log(`\nReAct Iteration ${iteration}/${this.maxIterations} [${currentAgent}]`);

        this.eventEmitter.emit<ReActIterationStartedEvent>({
          type: UIEventType.ReActIteration,
          iteration,
          maxIterations: this.maxIterations,
          observation: currentObservation,
        });

        try {
          // Get response from current agent
          const systemPrompt = subTaskAgentPrompts[currentAgent as keyof typeof subTaskAgentPrompts];
          const messages = [
            { role: 'system' as const, content: systemPrompt },
            ...this.conversationHistory,
            { role: 'user' as const, content: `Current observation: ${currentObservation}` }
          ];

          const response = await this.toolAgent.generateResponse(messages);
          const parsedResponse = this.parseResponse(response);

          if (!parsedResponse) {
            throw new Error('Failed to parse agent response');
          }

          this.eventEmitter.emit<ThoughtGeneratedEvent>({
            type: UIEventType.ThoughtGenerated,
            iteration,
            thought: parsedResponse.reasoning,
            context: currentObservation,
          });

          // Check for agent switch
          if (parsedResponse.agent_needed && parsedResponse.agent_needed !== currentAgent) {
            console.log(`Switching to ${parsedResponse.agent_needed} agent`);
            currentAgent = parsedResponse.agent_needed;
            continue; // Restart with new agent
          }

          this.eventEmitter.emit<ActionSelectedEvent>({
            type: UIEventType.ActionSelected,
            iteration,
            tool: parsedResponse.action.tool,
            args: parsedResponse.action.args,
            reasoning: parsedResponse.reasoning,
          });

          // Check for finish
          if (parsedResponse.action.tool === 'finish') {
            finished = true;
            console.log('Task completed');
          }

          const currentIteration: ReActIteration = {
            iteration,
            observation: currentObservation,
            thought: parsedResponse.reasoning,
            action: {
              agent: currentAgent,
              tool: parsedResponse.action.tool,
              args: parsedResponse.action.args
            },
            finished
          };

          this.conversationHistory.push(
            { role: 'user', content: `Observation: ${currentObservation}` },
            { role: 'assistant', content: response }
          );

          // Execute action if not finished
          if (!finished) {
            console.log(`Executing ${parsedResponse.action.tool}`);

            this.eventEmitter.emit<ToolCallStartedEvent>({
              type: UIEventType.ToolCallStarted,
              iteration,
              toolName: parsedResponse.action.tool,
              args: parsedResponse.action.args,
              description: `Executing ${parsedResponse.action.tool}`,
            });

            try {
              const toolStartTime = Date.now();
              const toolResult = await this.toolAgent.executeTool(
                parsedResponse.action.tool,
                parsedResponse.action.args
              );
              const toolDuration = Date.now() - toolStartTime;

              currentIteration.action.result = toolResult;
              currentObservation = `Previous: ${parsedResponse.action.tool}\nResult: ${JSON.stringify(toolResult, null, 2)}`;

              this.eventEmitter.emit<ToolCallCompletedEvent>({
                type: UIEventType.ToolCallCompleted,
                iteration,
                toolName: parsedResponse.action.tool,
                success: true,
                result: toolResult,
                duration: toolDuration,
              });

            } catch (toolError) {
              const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown tool error';
              currentIteration.action.error = errorMessage;
              currentObservation = `Previous: ${parsedResponse.action.tool}\nError: ${errorMessage}`;
              console.error(`Tool execution failed: ${errorMessage}`);

              this.eventEmitter.emit<ToolCallCompletedEvent>({
                type: UIEventType.ToolCallCompleted,
                iteration,
                toolName: parsedResponse.action.tool,
                success: false,
                error: errorMessage,
                duration: 0,
              });
            }
          } else {
            currentIteration.action.result = 'Task finished';
            currentObservation = 'Task completed successfully';
          }

          this.eventEmitter.emit<ObservationMadeEvent>({
            type: UIEventType.ObservationMade,
            iteration,
            observation: currentObservation,
            analysis: finished ? 'Task completed' : undefined,
          });

          history.push(currentIteration);

        } catch (iterationError) {
          const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
          console.error(`Iteration ${iteration} failed: ${errorMessage}`);

          history.push({
            iteration,
            observation: currentObservation,
            thought: 'Error occurred',
            action: { agent: currentAgent, tool: 'error', args: {}, error: errorMessage },
            finished: true
          });

          currentObservation = `Previous iteration failed: ${errorMessage}`;

          const recentErrors = history.slice(-2).filter(h => h.action.error).length;
          if (recentErrors >= 2) {
            console.error('Too many consecutive errors, terminating');
            break;
          }
        }
      }

      const duration = Date.now() - startTime;
      const success = finished || history.some(h => h.finished && !h.action.error);

      const result: TaskResult = {
        success,
        taskDescription: initialQuery,
        summary: this.generateSummary(history, success),
        iterations: iteration,
        duration,
        history
      };

      if (!success) {
        result.error = iteration >= this.maxIterations
          ? 'Maximum iterations reached'
          : 'Task failed';
      }

      console.log(`\nReAct task completed: ${success ? 'Success' : 'Failed'} in ${iteration} iterations`);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        taskDescription: initialQuery,
        summary: `Task failed: ${errorMessage}`,
        iterations: history.length,
        duration,
        error: errorMessage,
        history
      };
    }
  }

  private buildPrompt(observation: string, history: ReActIteration[]): string {
    const historyText = history.length > 0
      ? history.slice(-3).map(h =>
        `Iteration ${h.iteration}: ${h.thought} -> ${h.action.tool} -> ${h.action.result ? 'Success' : h.action.error || 'No result'}`
      ).join('\n')
      : 'No previous iterations';

    return `CURRENT OBSERVATION:
${observation}

RECENT HISTORY:
${historyText}

Based on the observation and history, determine your next action. Stay focused on your specialized role.`;
  }

  private parseResponse(response: string): AgentResponse | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch {
      return null;
    }
  }

  private generateSummary(history: ReActIteration[], success: boolean): string {
    if (history.length === 0) {
      return 'No iterations completed';
    }

    const lastIteration = history[history.length - 1];
    const agentsUsed = [...new Set(history.map(h => h.action.agent))];
    const toolsUsed = [...new Set(history.map(h => h.action.tool))];
    const errors = history.filter(h => h.action.error).length;

    return [
      `Task ${success ? 'completed' : 'failed'} after ${history.length} iterations.`,
      `Agents: ${agentsUsed.join(', ')}`,
      `Tools: ${toolsUsed.join(', ')}`,
      errors > 0 ? `${errors} errors encountered.` : 'No errors.',
      lastIteration.thought
    ].join(' ');
  }
}