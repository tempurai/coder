import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { TodoManager } from './TodoManager.js';
import { createSubAgentTool, SubAgent } from './SubAgent.js';
import { InterruptService } from '../../services/InterruptService.js';
import { ToolRegistry, ToolNames } from '../../tools/ToolRegistry.js';
import { z, ZodSchema } from "zod";
import { TextGeneratedEvent, ThoughtGeneratedEvent, ToolExecutionCompletedEvent, ToolExecutionStartedEvent } from '../../events/EventTypes.js';
import { PLANNING_PROMPT, PlanningResponse, PlanningResponseSchema, SMART_AGENT_PROMPT, SmartAgentResponse, SmartAgentResponseSchema } from './SmartAgentPrompt.js';

export type SmartAgentExecutionResult = {
  state: 'finished' | 'waiting_for_user' | 'error' | 'interrupted';
  error?: string;
};

export interface SmartAgentIteration extends SmartAgentResponse {
  iteration: number;
  observation: string;
  toolResults: Array<{
    tool: string;
    args: any;
    result?: any;
    error?: string;
    duration?: number;
  }>;
  timestamp: Date;
}

export interface TaskResult {
  success: boolean;
  taskDescription: string;
  summary: string;
  iterations: number;
  duration: number;
  error?: string;
  finalResult?: string;
}

@injectable()
export class SmartAgent {
  private maxIterations: number;
  private iterationHistory: Messages = [];
  private todoManager: TodoManager;
  private orchestrator: AgentOrchestrator;

  constructor(
    @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    @inject(TYPES.InterruptService) private interruptService: InterruptService,
    @inject(TYPES.ToolRegistry) private toolRegistry: ToolRegistry,
    maxIterations: number = 50
  ) {
    this.maxIterations = maxIterations;
    this.todoManager = new TodoManager(eventEmitter);
    this.orchestrator = new AgentOrchestrator(toolAgent, eventEmitter);
  }

  async runTask(initialQuery: string, sessionHistory: Messages = []): Promise<TaskResult> {
    const startTime = Date.now();
    const iterations: SmartAgentIteration[] = [];
    this.iterationHistory = [];

    console.log(`Starting intelligent task execution: ${initialQuery}`);

    try {
      await this.initializeTaskPlanning(initialQuery);
      const executionResult = await this.executeMainLoop(initialQuery, sessionHistory, iterations);
      const duration = Date.now() - startTime;
      return this.buildTaskResult(initialQuery, iterations, executionResult, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        taskDescription: initialQuery,
        summary: `Task failed: ${errorMessage}`,
        iterations: iterations.length,
        duration,
        error: errorMessage
      };
    }
  }

  private async initializeTaskPlanning(query: string): Promise<void> {
    console.log('Initializing task planning phase...');
    const planningMessages = [
      { role: 'system' as const, content: PLANNING_PROMPT },
      { role: 'user' as const, content: query }
    ];

    try {
      const planningResponse = await this.toolAgent.generateObject<PlanningResponse>({
        messages: planningMessages,
        schema: PlanningResponseSchema as ZodSchema<PlanningResponse>,
        allowTools: false
      });

      this.todoManager.createPlan(planningResponse.analysis);
      planningResponse.todos.forEach(todo => {
        this.todoManager.addTodo({ ...todo, dependencies: [] });
      });

      console.log(`Planning completed: ${planningResponse}`);
    } catch (error) {
      console.warn('Initial planning failed, proceeding with direct execution:', error);
    }
  }

  private async executeMainLoop(
    initialQuery: string,
    sessionHistory: Messages,
    iterations: SmartAgentIteration[]
  ): Promise<SmartAgentExecutionResult> {
    let iteration = 0;
    let currentObservation = `Task: ${initialQuery}`;
    let finished = false;

    while (!finished && iteration < this.maxIterations) {
      if (this.interruptService.isInterrupted()) {
        console.log('Task execution interrupted by user');
        return { state: 'interrupted' };
      }

      iteration++;
      console.log(`Smart Agent Iteration ${iteration}/${this.maxIterations}`);

      const iterationResult = await this.executeSingleIteration(
        iteration,
        currentObservation,
        sessionHistory
      );

      // Check for loops every 5 iterations
      if (iteration % 5 === 0) {
        const loopDetection = await this.orchestrator.detectLoop(this.iterationHistory);
        if (loopDetection.isLoop) {
          console.log(`Loop detected: ${loopDetection.description}`);
          // Create error iteration
          const errorIteration: SmartAgentIteration = {
            ...iterationResult,
            finished: true,
            toolResults: [{ tool: 'error', args: {}, error: loopDetection.description || 'Repetitive behavior detected' }]
          };
          iterations.push(errorIteration);
          break;
        }
      }

      iterations.push(iterationResult);
      finished = iterationResult.finished;

      // If task is finished, send final result to UI
      if (finished && iterationResult.result) {
        this.eventEmitter.emit({
          type: 'text_generated',
          text: iterationResult.result,
        } as TextGeneratedEvent);
        break;
      }

      // Update observation for next iteration
      const actionResults = iterationResult.toolResults
        .map(tr => `${tr.tool}: ${tr.result ? JSON.stringify(tr.result) : tr.error}`)
        .join('; ');
      currentObservation = `Previous actions: ${actionResults}`;

      if (!finished) {
        const shouldContinue = await this.orchestrator.shouldContinue(this.iterationHistory, currentObservation);
        if (!shouldContinue) {
          return { state: 'waiting_for_user' };
        }
      }

      // Check for too many consecutive errors
      const recentErrors = iterations.slice(-3).filter(it => it.toolResults.some(tr => tr.error)).length;
      if (recentErrors >= 2) {
        console.error('Too many consecutive errors, terminating');
        return { state: 'error', error: 'Too many consecutive errors' };
      }
    }

    return { state: 'finished' };
  }

  private async executeSingleIteration(
    iteration: number,
    observation: string,
    sessionHistory: Messages
  ): Promise<SmartAgentIteration> {
    try {
      if (this.interruptService.isInterrupted()) {
        return {
          iteration,
          observation,
          reasoning: 'Task interrupted by user',
          actions: [{ tool: 'interrupt', args: {} }],
          finished: true,
          toolResults: [{ tool: 'interrupt', args: {}, result: 'Task interrupted' }],
          timestamp: new Date()
        };
      }

      const messages: Messages = [
        { role: 'system', content: SMART_AGENT_PROMPT },
        ...sessionHistory,
        ...this.iterationHistory,
        { role: 'user', content: `Current observation: ${observation}` }
      ];

      const response = await this.toolAgent.generateObject<SmartAgentResponse>({
        messages,
        schema: SmartAgentResponseSchema as ZodSchema<SmartAgentResponse>
      });

      this.eventEmitter.emit({
        type: 'thought_generated',
        iteration,
        thought: response.reasoning,
        context: observation,
      } as ThoughtGeneratedEvent);

      // Update iteration history
      this.iterationHistory.push(
        { role: 'user', content: `Observation: ${observation}` },
        { role: 'assistant', content: JSON.stringify(response, null, 2) }
      );

      // Execute all actions and collect results
      const toolResults: SmartAgentIteration['toolResults'] = [];
      if (!response.finished) {
        for (const action of response.actions) {
          const toolResult = await this.executeToolSafely(iteration, action);
          toolResults.push({
            tool: action.tool,
            args: action.args,
            result: toolResult.result,
            error: toolResult.error,
            duration: toolResult.duration
          });
        }
      }

      return {
        ...response,
        iteration,
        observation,
        toolResults,
        timestamp: new Date()
      };
    } catch (iterationError) {
      const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
      console.error(`Iteration ${iteration} failed: ${errorMessage}`);
      return {
        iteration,
        observation,
        reasoning: 'Iteration error occurred',
        actions: [{ tool: 'error', args: {} }],
        finished: true,
        toolResults: [{ tool: 'error', args: {}, error: errorMessage }],
        timestamp: new Date()
      };
    }
  }

  private async executeToolSafely(iteration: number, action: { tool: string, args: any }): Promise<{
    result?: any,
    error?: string,
    duration?: number
  }> {
    if (this.interruptService.isInterrupted()) {
      return { error: 'Tool execution interrupted by user' };
    }

    this.eventEmitter.emit({
      type: 'tool_execution_started',
      iteration,
      toolName: action.tool,
      args: action.args,
    } as ToolExecutionStartedEvent);

    try {
      const toolStartTime = Date.now();
      const toolResult = await this.toolAgent.executeTool(action.tool, action.args);
      const toolDuration = Date.now() - toolStartTime;

      this.eventEmitter.emit({
        type: 'tool_execution_completed',
        iteration,
        toolName: action.tool,
        success: true,
        result: toolResult,
        duration: toolDuration,
      } as ToolExecutionCompletedEvent);

      return { result: toolResult, duration: toolDuration };
    } catch (toolError) {
      const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown tool error';
      this.eventEmitter.emit({
        type: 'tool_execution_completed',
        iteration,
        toolName: action.tool,
        success: false,
        error: errorMessage,
        duration: 0,
      } as ToolExecutionCompletedEvent);

      return { error: errorMessage };
    }
  }

  private buildTaskResult(
    initialQuery: string,
    iterations: SmartAgentIteration[],
    executionResult: SmartAgentExecutionResult,
    duration: number
  ): TaskResult {
    const success = executionResult.state === 'finished' && !executionResult.error &&
      iterations.some(it => it.finished && !it.toolResults.some(tr => tr.error));

    let summary: string;
    let finalResult: string | undefined;

    if (success && iterations.length > 0) {
      const lastIteration = iterations[iterations.length - 1];
      finalResult = lastIteration.result;
      summary = finalResult || 'Task completed successfully';
    } else {
      switch (executionResult.state) {
        case 'interrupted':
          summary = 'Task interrupted by user.';
          break;
        case 'waiting_for_user':
          summary = 'Paused: waiting for user input/confirmation.';
          break;
        case 'error':
          summary = executionResult.error || 'Task failed due to errors';
          break;
        default:
          summary = iterations.length >= this.maxIterations ? 'Maximum iterations reached' : 'Task failed';
      }
    }

    return {
      success,
      taskDescription: initialQuery,
      summary,
      iterations: iterations.length,
      duration,
      error: success ? undefined : (executionResult.error || summary),
      finalResult
    };
  }

  public initializeTools(): void {
    const todoTool = this.todoManager.createTool();
    this.toolRegistry.register({ name: ToolNames.TODO_MANAGER, tool: todoTool });

    const subAgentTool = createSubAgentTool(this.toolAgent, this.eventEmitter);
    this.toolRegistry.register({ name: ToolNames.START_SUBAGENT, tool: subAgentTool });
  }
}