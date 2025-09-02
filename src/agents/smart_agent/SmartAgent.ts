import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { ToolAgent, Message, Messages, TaskExecutionResult, TerminateReason } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { TodoManager } from './TodoManager.js';
import { createSubAgentTool, SubAgent } from './SubAgent.js';
import { InterruptService } from '../../services/InterruptService.js';
import { ToolRegistry, ToolNames } from '../../tools/ToolRegistry.js';
import { z, ZodSchema } from "zod";
import { TextGeneratedEvent, ThoughtGeneratedEvent, ToolExecutionCompletedEvent, ToolExecutionStartedEvent } from '../../events/EventTypes.js';
import { getSmartAgentPrompt, PlanningResponse, PlanningResponseSchema, SmartAgentResponse, SmartAgentResponseFinished, SmartAgentResponseSchema } from './SmartAgentPrompt.js';
import { EditModeManager, EditMode } from '../../services/EditModeManager.js';
import { SecurityPolicyEngine } from '../../security/SecurityPolicyEngine.js';
import { ToolInterceptor } from './ToolInterceptor.js';

export interface SmartAgentMessage extends Message {
  iteration: number;
}

@injectable()
export class SmartAgent {
  private maxIterations: number;
  private iterations: SmartAgentMessage[] = [];
  private todoManager: TodoManager;
  private orchestrator: AgentOrchestrator;
  private toolInterceptor: ToolInterceptor;

  constructor(
    @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    @inject(TYPES.InterruptService) private interruptService: InterruptService,
    @inject(TYPES.ToolRegistry) private toolRegistry: ToolRegistry,
    @inject(TYPES.EditModeManager) private editModeManager: EditModeManager,
    @inject(TYPES.SecurityPolicyEngine) private securityEngine: SecurityPolicyEngine,
    maxIterations: number = 50
  ) {
    this.maxIterations = maxIterations;
    this.todoManager = new TodoManager(eventEmitter);
    this.orchestrator = new AgentOrchestrator(toolAgent, eventEmitter);
    this.toolInterceptor = new ToolInterceptor({
      editModeManager: this.editModeManager,
      securityEngine: this.securityEngine,
      toolAgent: this.toolAgent
    });
  }

  async runTask(initialQuery: string, sessionHistory: Messages = []): Promise<TaskExecutionResult> {
    this.iterations = [...sessionHistory.map((msg, i) => ({ ...msg, iteration: 0 }))];
    console.log(`Starting intelligent task execution: ${initialQuery}`);

    const startTime = Date.now();
    try {
      await this.initializeTaskPlanning(initialQuery);
      const result = await this.executeMainLoop(initialQuery);

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
        history: this.toMessages(this.iterations),
        error: errorMessage
      };
    }
  }

  private async initializeTaskPlanning(query: string): Promise<void> {
    console.log('Initializing task planning phase...');

    // 只有在非Plan模式下才进行初始todo创建
    const editMode = this.editModeManager.getCurrentMode();
    if (editMode === EditMode.PLAN_ONLY) {
      // Plan模式下让Agent自然地探索和规划
      return;
    }

    const planningMessages = [
      { role: 'system' as const, content: 'You are a task planning specialist. Analyze the user request and break it down into actionable todos if it\'s complex enough to warrant structured planning.' },
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

      console.log("Planning completed", planningResponse);
    } catch (error) {
      console.warn('Initial planning failed, proceeding with direct execution:', error);
    }
  }

  private async executeMainLoop(initialQuery: string): Promise<TaskExecutionResult> {
    let iteration = 0;
    let currentObservation = `Task: ${initialQuery}`;
    let finished = false;
    let recentErrorCount = 0;

    while (!finished && iteration < this.maxIterations) {
      if (this.interruptService.isInterrupted()) {
        console.log('Task execution interrupted by user');
        return {
          terminateReason: 'INTERRUPTED',
          history: this.toMessages(this.iterations),
          metadata: {
            iterations: iteration,
          }
        };
      }

      iteration++;
      console.log(`Smart Agent Iteration ${iteration}/${this.maxIterations}`);

      const { response, observation, error } = await this.executeSingleIteration(iteration, currentObservation);

      if (iteration % 10 === 0) {
        const iterationHistory = this.toMessages(this.iterations);
        const loopDetection = await this.orchestrator.detectLoop(iterationHistory);
        if (loopDetection.isLoop) {
          console.log(`Loop detected: ${loopDetection.description}`);
          return { terminateReason: 'ERROR', history: iterationHistory, error: loopDetection.description || 'Repetitive behavior detected' };
        }
      }

      finished = response.finished;
      if (finished) {
        this.eventEmitter.emit({
          type: 'text_generated',
          text: response.result,
        } as TextGeneratedEvent);

        return {
          terminateReason: 'FINISHED',
          history: this.toMessages(this.iterations),
          metadata: {
            iterations: iteration,
          }
        };
      }

      currentObservation = observation;

      if (!finished) {
        const iterationHistory = this.toMessages(this.iterations);
        const shouldContinue = await this.orchestrator.shouldContinue(iterationHistory, currentObservation);
        if (!shouldContinue) {
          return { terminateReason: 'WAITING_FOR_USER', history: iterationHistory };
        }
      }

      recentErrorCount += (error ? 1 : 0);
      if (recentErrorCount >= 2) {
        console.error('Too many consecutive errors, terminating');
        return { terminateReason: 'ERROR', history: this.toMessages(this.iterations), error: 'Too many consecutive errors' };
      }
    }

    if (iteration >= this.maxIterations) {
      return {
        terminateReason: 'TIMEOUT',
        history: this.toMessages(this.iterations),
        metadata: {
          iterations: iteration,
        }
      };
    }

    return {
      terminateReason: 'FINISHED',
      history: this.toMessages(this.iterations),
      metadata: {
        iterations: iteration,
      }
    };
  }

  private async executeSingleIteration(
    iteration: number,
    observation: string
  ): Promise<{ response: SmartAgentResponse; observation: string, error?: string }> {
    try {
      if (this.interruptService.isInterrupted()) {
        const response = { reasoning: 'Task interrupted by user', actions: [], finished: true, result: "" } as SmartAgentResponseFinished;
        this.iterations.push(
          { role: 'user', content: `Observation: ${observation}`, iteration },
          { role: 'assistant', content: JSON.stringify(response, null, 2), iteration }
        );
        return { response, observation: 'Task interrupted' };
      }

      // 使用动态Prompt
      const editMode = this.editModeManager.getCurrentMode();
      const systemPrompt = getSmartAgentPrompt(editMode);

      const messages: Messages = [
        { role: 'system', content: systemPrompt },
        ...this.toMessages(this.iterations),
        { role: 'user', content: `Current observation: ${observation}` }
      ];

      const response = await this.toolAgent.generateObject<SmartAgentResponse>({
        messages,
        schema: SmartAgentResponseSchema as ZodSchema<SmartAgentResponse>
      });

      this.iterations.push(
        { role: 'user', content: `Observation: ${observation}`, iteration },
        { role: 'assistant', content: JSON.stringify(response, null, 2), iteration }
      );

      let nextObservation = 'No actions executed';

      if (!response.finished) {
        this.eventEmitter.emit({
          type: 'thought_generated',
          iteration,
          thought: response.reasoning,
          context: observation,
        } as ThoughtGeneratedEvent);

        const toolResults = [];
        for (const action of response.actions) {
          // 使用ToolInterceptor来安全执行工具
          const toolResult = await this.toolInterceptor.executeToolSafely(iteration, action);
          toolResults.push({
            tool: action.tool,
            args: action.args,
            result: toolResult.result,
            error: toolResult.error,
            duration: toolResult.duration
          });
        }

        const toolMessage = JSON.stringify(toolResults, null, 2);
        this.iterations.push({
          role: 'user',
          content: toolMessage,
          iteration
        });

        const results = toolResults.map(tr =>
          `${tr.tool}: ${tr.result ? JSON.stringify(tr.result) : tr.error}`
        );
        nextObservation = `Previous actions: ${results.join('; ')}`;
      }

      return { response, observation: nextObservation };
    } catch (iterationError) {
      const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
      console.error(`Iteration ${iteration} failed: ${errorMessage}`);
      const response = { reasoning: 'Iteration error occurred', actions: [], finished: true, result: "" } as SmartAgentResponseFinished;
      this.iterations.push(
        { role: 'user', content: `Observation: ${observation}`, iteration },
        { role: 'assistant', content: JSON.stringify(response, null, 2), iteration }
      );
      return { response, observation: "", error: errorMessage };
    }
  }

  private toMessages(smartAgentMessages: SmartAgentMessage[]): Messages {
    return smartAgentMessages.map(m => ({ role: m.role, content: m.content }));
  }

  public initializeTools(): void {
    const todoTool = this.todoManager.createTool();
    this.toolRegistry.register({ name: ToolNames.TODO_MANAGER, tool: todoTool });

    const subAgentTool = createSubAgentTool(this.toolAgent, this.eventEmitter);
    this.toolRegistry.register({ name: ToolNames.START_SUBAGENT, tool: subAgentTool });
  }
}