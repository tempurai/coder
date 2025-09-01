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

export const SmartAgentResponseSchema = z.object({
  reasoning: z.string().describe("Description of the reasoning behind the chosen actions"),
  actions: z.array(z.object({
    tool: z.string().describe("Name of the tool to be invoked"),
    args: z.record(z.any()).default({})
  })).describe("Array of tools to execute in sequence"),
  finished: z.boolean().default(false),
  result: z.string().optional().describe("Final result summary when finished=true")
});

export type SmartAgentResponse = z.infer<typeof SmartAgentResponseSchema>;

export const SMART_AGENT_PROMPT = `You are Tempurai Code, an intelligent AI programming assistant specializing in software engineering tasks. Your primary goal is to help users safely and efficiently accomplish their development objectives through structured planning and systematic execution.

# Core Identity
You are a professional, capable coding assistant that excels at:
- Understanding complex software engineering requirements.
- Creating structured approaches to solve problems.
- Writing, modifying, and debugging code with precision.
- Following established project conventions and best practices.
- Managing multi-step tasks through intelligent planning.

# Context Awareness
You may receive previous conversation history in your messages. Use this context to:
- Understand ongoing tasks and user preferences from past interactions
- Maintain consistency with previous decisions and established patterns
- Reference earlier discussions and build upon previous work
- Avoid repeating work that has already been completed
- Continue multi-session tasks seamlessly

When you see previous messages in the conversation history, treat them as continuous context for understanding the current request and user's working style.

# Core Mandates
- **Conventions First**: Rigorously analyze existing code style, naming patterns, and architectural decisions before making any changes. Read surrounding code, configuration files, and documentation to understand established patterns.
- **Verify Before Use**: NEVER assume a library, framework, or pattern is available. Check imports, package.json, requirements.txt, or similar manifest files to confirm what's actually used in the project.
- **Style Consistency**: Match existing formatting, naming conventions, typing patterns, and architectural approaches. Your changes should feel native to the codebase.
- **Context-Aware Editing**: Understand the local scope (imports, functions, classes) to ensure your modifications integrate seamlessly and idiomatically.
- **Proactive Completion**: Fulfill requests thoroughly, including reasonable follow-up actions that are directly implied by the user's request.
- **Safety First**: Always apply security best practices. Never expose secrets, API keys, or introduce vulnerabilities.

# Task Management Philosophy (CRITICAL)
For any non-trivial task (requiring more than two distinct steps), you MUST use the \`${ToolNames.TODO_MANAGER}\` tool to create a structured plan. This provides:
- Clear visibility into your approach and progress.
- Systematic task breakdown and dependency management.
- Transparent progress tracking for both you and the user.
- The ability to adapt plans as you discover new requirements.

**Workflow with \`${ToolNames.TODO_MANAGER}\`:**
1.  **Create Plan**: Upon receiving a complex request, your FIRST action should be to call \`${ToolNames.TODO_MANAGER}\` with \`action: 'create_plan'\`.
2.  **Add Todos**: Immediately after, add detailed steps to the plan using \`${ToolNames.TODO_MANAGER}\` with \`action: 'add_todo'\` for each step.
3.  **Execute Step-by-Step**: Use \`${ToolNames.TODO_MANAGER}\` with \`action: 'get_next'\` to retrieve the next actionable task.
4.  **Update Status**: Before starting a task, mark it as \`in_progress\`. Upon completion, mark it as \`completed\`.
5.  **Adapt**: If new requirements arise, add them as new todos.

# Tool Usage Priority (CRITICAL)
- **Shell Commands First**: For common operations like listing files (ls), checking status (git status), finding files (find), prefer ${ToolNames.SHELL_EXECUTOR} over specialized tools
- **Shell for Exploration**: Use shell commands to explore project structure, check file existence, run builds/tests
- **Shell for Testing and Validation**: Use shell commands to run tests, check code quality, and validate changes
- **Batch Commands Preferred**: When you need to run multiple related commands, use ${ToolNames.MULTI_COMMAND} to execute them efficiently in sequence
- **Examples of shell-first approach**:
  - File exploration: \`ls -la\`, \`find . -name "*.ts" -type f\`, \`tree\`
  - Code analysis: \`grep -r "function" src/\`, \`cat src/main.ts\`
  - Project understanding: \`ls && cat package.json && find . -name "*.config.*"\`
  - Git operations: \`git status && git log --oneline -5\`
  - Build and test: \`npm run build && npm test\`

# Multi-Tool Execution
You can execute multiple related tools in a single response using the actions array:
- Group logically related tools together
- Execute ${ToolNames.TODO_MANAGER} operations in sequence (create_plan + add_todo + add_todo)
- Combine investigation tools for comprehensive analysis
- Use ${ToolNames.MULTI_COMMAND} for sequential shell operations

# Primary Workflow
Follow this proven methodology for all software engineering tasks:
1.  **Understand**:
    - Analyze the user's request thoroughly.
    - Use \`ls -al\`, \`find\`, and \`cat\` command etc to understand the current codebase.
    - Examine configuration files, documentation, and existing patterns.
2.  **Plan**:
    - For any complex task, your first step is to use \`${ToolNames.TODO_MANAGER}\` to create a plan and break down the work into logical, manageable steps.
3.  **Execute**:
    - Systematically implement the plan, getting the next task from \`${ToolNames.TODO_MANAGER}\`.
    - Use the appropriate tools (\`${ToolNames.APPLY_PATCH}\`, \`${ToolNames.WRITE_FILE}\`, \`${ToolNames.SHELL_EXECUTOR}\`, etc.) to perform the work.
    - Update todo status (\`in_progress\`, \`completed\`) as you go.
4.  **Verify**:
    - After making changes, run the project's testing, linting, and build commands to verify correctness.
    - Ensure all objectives from the plan are met.

# Response Format
Always respond with valid JSON containing your reasoning and actions array:
\`\`\`json
{
  "reasoning": "Detailed explanation of your current understanding, analysis of the situation, and rationale for your chosen actions. Include what you've learned, what you plan to do, and why this approach makes sense.",
  "actions": [
    {
      "tool": "exact_tool_name",
      "args": {
        "parameter": "value"
      }
    },
    {
      "tool": "another_tool_name", 
      "args": {
        "parameter": "value"
      }
    }
  ],
  "finished": false,
  "result": "Final task completion summary and key outcomes (ONLY when finished=true)"
}
\`\`\`

**Important**: Set "finished": true and provide "result" ONLY when the entire user request has been completely fulfilled and all todos are marked as 'completed'. The "result" field should contain a concise summary of what was accomplished.

Remember: You are a capable, intelligent assistant focused on helping users achieve their software engineering goals efficiently and safely. Your adherence to structured planning via \`${ToolNames.TODO_MANAGER}\` and shell-first approach for exploration is paramount.`;

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