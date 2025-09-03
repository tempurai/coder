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
import { SystemInfoEvent, TextGeneratedEvent, ThoughtGeneratedEvent, ToolExecutionCompletedEvent, ToolExecutionStartedEvent } from '../../events/EventTypes.js';
import { PLANNING_PROMPT, PlanningResponse, PlanningResponseSchema, SMART_AGENT_PLAN_PROMPT, SMART_AGENT_PROMPT, SmartAgentResponse, SmartAgentResponseFinished, SmartAgentResponseSchema } from './SmartAgentPrompt.js';
import { EditModeManager, EditMode } from '../../services/EditModeManager.js';
import { ExecutionMode } from '../../services/ExecutionModeManager.js';
import { SecurityPolicyEngine } from '../../security/SecurityPolicyEngine.js';
import { ToolInterceptor } from './ToolInterceptor.js';

export interface SmartAgentMessage extends Message {
  iteration: number;
}

@injectable()
export class SmartAgent {
  private maxIterations: number;
  private memory: SmartAgentMessage[] = [];
  private orchestrator: AgentOrchestrator;

  constructor(
    @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    @inject(TYPES.InterruptService) private interruptService: InterruptService,
    @inject(TYPES.ToolRegistry) private toolRegistry: ToolRegistry,
    @inject(TYPES.EditModeManager) private editModeManager: EditModeManager,
    @inject(TYPES.SecurityPolicyEngine) private securityEngine: SecurityPolicyEngine,
    @inject(TYPES.TodoManager) private todoManager: TodoManager,
    @inject(TYPES.ToolInterceptor) private toolInterceptor: ToolInterceptor,
    maxIterations: number = 50
  ) {
    this.maxIterations = maxIterations;
    this.orchestrator = new AgentOrchestrator(toolAgent, eventEmitter);
  }

  async executeTask(initialQuery: string, sessionHistory: Messages = [], executionMode: ExecutionMode = ExecutionMode.CODE): Promise<TaskExecutionResult> {
    this.memory = [...sessionHistory.map((msg, i) => ({ ...msg, iteration: 0 }))];
    console.log(`Starting intelligent task execution: ${initialQuery} (mode: ${executionMode})`);

    const startTime = Date.now();

    try {
      if (executionMode != ExecutionMode.PLAN) {
        await this.initialPlanningExecution(initialQuery);
      }

      const result = await this.executeMainLoop(initialQuery, executionMode);

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
      this.eventEmitter.emit({
        type: 'system_info',
        level: 'error',
        source: 'agent',
        message: `Task execution failed: ${errorMessage}`
      } as SystemInfoEvent);

      return {
        terminateReason: 'ERROR',
        history: this.processHistory(this.memory),
        error: errorMessage
      };
    }
  }

  private async initialPlanningExecution(query: string): Promise<void> {
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

      console.log("Planning completed", planningResponse);
    } catch (error) {
      this.eventEmitter.emit({
        type: 'system_info',
        level: 'error',
        source: 'agent',
        message: `Initial planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      } as SystemInfoEvent);
      console.warn('Initial planning failed, proceeding with direct execution:', error);
    }
  }

  private async executeMainLoop(initialQuery: string, executionMode: ExecutionMode): Promise<TaskExecutionResult> {
    let currentIteration = 0;
    let isCompleted = false;
    let recentErrorCount = 0;

    this.memory.unshift({
      iteration: 0, role: 'system',
      content: executionMode === ExecutionMode.PLAN ? SMART_AGENT_PLAN_PROMPT : SMART_AGENT_PROMPT
    });

    this.memory.push(
      { iteration: 0, role: "user", content: `Task: ${initialQuery}` }
    );

    while (!isCompleted && currentIteration < this.maxIterations) {
      if (this.interruptService.isInterrupted()) {
        console.log('Task execution interrupted by user');
        return {
          terminateReason: 'INTERRUPTED',
          history: this.processHistory(this.memory),
          metadata: {
            iterations: currentIteration,
          }
        };
      }

      currentIteration++;
      console.log(`Smart Agent Iteration ${currentIteration}/${this.maxIterations}`);

      const { response, error } = await this.executeSingleIteration(currentIteration, executionMode);

      if (currentIteration % 10 === 0) {
        // 检测循环
        const iterationHistory = this.processHistory(this.memory);
        const loopDetection = await this.orchestrator.detectLoop(iterationHistory);
        if (loopDetection.isLoop) {
          this.eventEmitter.emit({
            type: 'system_info',
            level: 'error',
            source: 'agent',
            message: `Loop detected: ${loopDetection.description}`
          } as SystemInfoEvent);
          console.log(`Loop detected: ${loopDetection.description}`);
          return { terminateReason: 'ERROR', history: iterationHistory, error: loopDetection.description || 'Repetitive behavior detected' };
        }

        const shouldContinue = await this.orchestrator.shouldContinue(iterationHistory);
        if (!shouldContinue) {
          return { terminateReason: 'WAITING_FOR_USER', history: iterationHistory };
        }
      }

      isCompleted = response.finished;
      if (isCompleted) {
        this.eventEmitter.emit({ type: 'text_generated', text: response.result } as TextGeneratedEvent);
        break;
      }

      recentErrorCount += (error ? 1 : 0);
      if (recentErrorCount >= 2) {
        this.eventEmitter.emit({
          type: 'system_info',
          level: 'error',
          source: 'agent',
          message: 'Too many consecutive errors, terminating task'
        } as SystemInfoEvent);
        console.error('Too many consecutive errors, terminating');
        return { terminateReason: 'ERROR', history: this.processHistory(this.memory), error: 'Too many consecutive errors' };
      }
    }

    if (currentIteration > this.maxIterations) {
      return {
        terminateReason: 'TIMEOUT',
        history: this.processHistory(this.memory),
        metadata: {
          iterations: currentIteration,
        }
      };
    }

    return {
      terminateReason: 'FINISHED',
      history: this.processHistory(this.memory),
      metadata: {
        iterations: currentIteration,
      }
    };
  }

  private async executeSingleIteration(currentIteration: number, executionMode: ExecutionMode): Promise<{ response: SmartAgentResponse; error?: string }> {
    try {
      console.log(`Requesting`, this.processHistory(this.memory));

      const response = await this.toolAgent.generateObject<SmartAgentResponse>({
        messages: this.processHistory(this.memory),
        schema: SmartAgentResponseSchema as ZodSchema<SmartAgentResponse>
      });

      this.memory.push(
        { role: 'assistant', content: JSON.stringify(response, null, 2), iteration: currentIteration }
      );

      console.log(`Agent Response: ${JSON.stringify(response)}`);

      if (response.finished) {
        return { response };
      }

      this.eventEmitter.emit({ type: 'thought_generated', iteration: currentIteration, thought: response.reasoning } as ThoughtGeneratedEvent);

      const toolResults = [];
      for (const action of response.actions) {
        const toolResult = await this.toolInterceptor.executeToolSafely(currentIteration, action, executionMode);
        toolResults.push(JSON.stringify(toolResult.result, null, 0) || toolResult.error);
      }

      this.memory.push(
        { role: 'assistant', content: `Actions Results: ${toolResults.join('; ')}`, iteration: currentIteration }
      );

      return { response };
    } catch (iterationError) {
      const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
      this.eventEmitter.emit({
        type: 'system_info',
        level: 'error',
        source: 'agent',
        message: `Iteration ${currentIteration} failed: ${errorMessage}`
      } as SystemInfoEvent);
      console.error(`Iteration ${currentIteration} failed: ${errorMessage}`);

      const response = { reasoning: 'Iteration error occurred', actions: [], finished: true, result: "" } as SmartAgentResponseFinished;
      this.memory.push({ role: 'user', content: `Observation: ${response}`, iteration: currentIteration });
      return { response, error: errorMessage };
    }
  }

  private processHistory(smartAgentMessages: SmartAgentMessage[]): Messages {
    return smartAgentMessages.map(m => ({ role: m.role, content: m.content }));
  }

  public async initializeTools(executionMode: ExecutionMode): Promise<void> {
    await this.toolAgent.initializeAsync();

    const todoTool = this.todoManager.createTool();
    this.toolRegistry.register({ name: ToolNames.TODO_MANAGER, tool: todoTool });

    const subAgentTool = createSubAgentTool(executionMode);
    this.toolRegistry.register({ name: ToolNames.START_SUBAGENT, tool: subAgentTool });
  }
}
