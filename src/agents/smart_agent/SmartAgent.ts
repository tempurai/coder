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
import { PLANNING_PROMPT, PlanningResponse, PlanningResponseSchema, SMART_AGENT_PLAN_PROMPT, SMART_AGENT_PROMPT, SmartAgentResponse, SmartAgentResponseFinished, SmartAgentResponseSchema } from './SmartAgentPrompt.js';
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

  constructor(
    @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    @inject(TYPES.InterruptService) private interruptService: InterruptService,
    @inject(TYPES.ToolRegistry) private toolRegistry: ToolRegistry,
    @inject(TYPES.EditModeManager) private editModeManager: EditModeManager,
    @inject(TYPES.SecurityPolicyEngine) private securityEngine: SecurityPolicyEngine,
    @inject(TYPES.ToolInterceptor) private toolInterceptor: ToolInterceptor,
    maxIterations: number = 50
  ) {
    this.maxIterations = maxIterations;
    this.todoManager = new TodoManager(eventEmitter);
    this.orchestrator = new AgentOrchestrator(toolAgent, eventEmitter);
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
      return;
    }

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

      console.log("Planning completed", planningResponse);
    } catch (error) {
      console.warn('Initial planning failed, proceeding with direct execution:', error);
    }
  }

  private async executeMainLoop(initialQuery: string): Promise<TaskExecutionResult> {
    let iteration = 0;
    let finished = false;
    let recentErrorCount = 0;

    this.iterations.push(
      {
        iteration: 0, role: 'system',
        content: this.editModeManager.getCurrentMode() == EditMode.PLAN_ONLY ? SMART_AGENT_PLAN_PROMPT : SMART_AGENT_PROMPT
      },
      { iteration: 0, role: "user", content: `Task: ${initialQuery}` }
    );

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

      const { response, error } = await this.executeSingleIteration(iteration);

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

      if (!finished) {
        const iterationHistory = this.toMessages(this.iterations);
        const shouldContinue = await this.orchestrator.shouldContinue(iterationHistory);
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

  private async executeSingleIteration(iteration: number): Promise<{ response: SmartAgentResponse; error?: string }> {
    try {
      if (this.interruptService.isInterrupted()) {
        const response = { reasoning: 'Task interrupted by user', actions: [], finished: true, result: "" } as SmartAgentResponseFinished;
        this.iterations.push({ role: 'assistant', content: JSON.stringify(response, null, 2), iteration });
        return { response };
      }

      const response = await this.toolAgent.generateObject<SmartAgentResponse>({
        messages: this.toMessages(this.iterations),
        schema: SmartAgentResponseSchema as ZodSchema<SmartAgentResponse>
      });

      this.iterations.push(
        { role: 'assistant', content: JSON.stringify(response, null, 2), iteration }
      );

      if (!response.finished) {
        this.eventEmitter.emit({
          type: 'thought_generated',
          iteration,
          thought: response.reasoning,
        } as ThoughtGeneratedEvent);

        const toolResults = [];
        for (const action of response.actions) {
          const toolResult = await this.toolInterceptor.executeToolSafely(iteration, action);
          toolResults.push(JSON.stringify(toolResult.result, null, 0) || toolResult.error);
        }

        this.iterations.push(
          { role: 'assistant', content: `Actions Results: ${toolResults.join('; ')}`, iteration }
        );
      }

      return { response };

    } catch (iterationError) {
      const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
      console.error(`Iteration ${iteration} failed: ${errorMessage}`);
      const response = { reasoning: 'Iteration error occurred', actions: [], finished: true, result: "" } as SmartAgentResponseFinished;
      this.iterations.push(
        { role: 'user', content: `Observation: ${response}`, iteration },
      );
      return { response, error: errorMessage };
    }
  }

  private toMessages(smartAgentMessages: SmartAgentMessage[]): Messages {
    return smartAgentMessages.map(m => ({ role: m.role, content: m.content }));
  }

  public initializeTools(): void {
    const todoTool = this.todoManager.createTool();
    this.toolRegistry.register({ name: ToolNames.TODO_MANAGER, tool: todoTool });

    const subAgentTool = createSubAgentTool(this.toolAgent, this.eventEmitter, this.securityEngine);
    this.toolRegistry.register({ name: ToolNames.START_SUBAGENT, tool: subAgentTool });
  }
}