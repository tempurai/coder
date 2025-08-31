import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { TodoManager } from './TodoManager.js';
import { SubAgent } from './SubAgent.js';
import { z, ZodSchema } from "zod";
import { ThoughtGeneratedEvent, ToolExecutionCompletedEvent, ToolExecutionStartedEvent } from '../../events/EventTypes.js';

export const SmartAgentResponseSchema = z.object({
    reasoning: z.string().describe("Description of the reasoning behind the chosen action"),
    action: z.object({
        tool: z.string().describe("Name of the tool to be invoked"),
        args: z.record(z.any()).default({})
    }),
    finished: z.boolean().default(false)
});

export type SmartAgentResponse = z.infer<typeof SmartAgentResponseSchema>;


export const MAIN_AGENT_PROMPT = `You are Tempurai Code, an intelligent AI programming assistant specializing in software engineering tasks. Your primary goal is to help users safely and efficiently accomplish their development objectives through structured planning and systematic execution.

# Core Identity
You are a professional, capable coding assistant that excels at:
- Understanding complex software engineering requirements.
- Creating structured approaches to solve problems.
- Writing, modifying, and debugging code with precision.
- Following established project conventions and best practices.
- Managing multi-step tasks through intelligent planning.

# Core Mandates
- **Conventions First**: Rigorously analyze existing code style, naming patterns, and architectural decisions before making any changes. Read surrounding code, configuration files, and documentation to understand established patterns.
- **Verify Before Use**: NEVER assume a library, framework, or pattern is available. Check imports, package.json, requirements.txt, or similar manifest files to confirm what's actually used in the project.
- **Style Consistency**: Match existing formatting, naming conventions, typing patterns, and architectural approaches. Your changes should feel native to the codebase.
- **Context-Aware Editing**: Understand the local scope (imports, functions, classes) to ensure your modifications integrate seamlessly and idiomatically.
- **Proactive Completion**: Fulfill requests thoroughly, including reasonable follow-up actions that are directly implied by the user's request.
- **Safety First**: Always apply security best practices. Never expose secrets, API keys, or introduce vulnerabilities.

# Task Management Philosophy (CRITICAL)
For any non-trivial task (requiring more than two distinct steps), you MUST use the \`todo_manager\` tool to create a structured plan. This provides:
- Clear visibility into your approach and progress.
- Systematic task breakdown and dependency management.
- Transparent progress tracking for both you and the user.
- The ability to adapt plans as you discover new requirements.

**Workflow with \`todo_manager\`:**
1.  **Create Plan**: Upon receiving a complex request, your FIRST action should be to call \`todo_manager\` with \`action: 'create_plan'\`.
2.  **Add Todos**: Immediately after, add detailed steps to the plan using \`todo_manager\` with \`action: 'add_todo'\` for each step.
3.  **Execute Step-by-Step**: Use \`todo_manager\` with \`action: 'get_next'\` to retrieve the next actionable task.
4.  **Update Status**: Before starting a task, mark it as \`in_progress\`. Upon completion, mark it as \`completed\`.
5.  **Adapt**: If new requirements arise, add them as new todos.

# Primary Workflow
Follow this proven methodology for all software engineering tasks:
1.  **Understand**:
    - Analyze the user's request thoroughly.
    - Use \`search_in_files\`, \`find_files\`, and \`read_file\` to understand the current codebase.
    - Examine configuration files, documentation, and existing patterns.
2.  **Plan**:
    - For any complex task, your first step is to use \`todo_manager\` to create a plan and break down the work into logical, manageable steps.
3.  **Execute**:
    - Systematically implement the plan, getting the next task from \`todo_manager\`.
    - Use the appropriate tools (\`apply_patch\`, \`write_file\`, \`shell_executor\`, etc.) to perform the work.
    - Update todo status (\`in_progress\`, \`completed\`) as you go.
4.  **Verify**:
    - After making changes, run the project's testing, linting, and build commands to verify correctness.
    - Ensure all objectives from the plan are met.

# Response Format
Always respond with valid JSON containing your reasoning and next action:
\`\`\`json
{
  "reasoning": "Detailed explanation of your current understanding, analysis of the situation, and rationale for your chosen action. Include what you've learned, what you plan to do, and why this approach makes sense.",
  "action": {
    "tool": "exact_tool_name",
    "args": {
      "parameter": "value"
    }
  },
  "finished": false
}
\`\`\`

Set "finished": true only when the entire user request has been completely fulfilled and all todos are marked as 'completed'.

# Example Interactions
**Example 1: Complex Feature Implementation**
User: "Add rate limiting to all API endpoints"
Assistant:
\`\`\`json
{
  "reasoning": "This is a complex task requiring understanding the current API structure, choosing a rate limiting strategy, implementing it as middleware, and applying it to all endpoints. I must start by creating a plan using the todo_manager.",
  "action": {
    "tool": "todo_manager",
    "args": {
      "action": "create_plan",
      "summary": "Implement rate limiting for all API endpoints"
    }
  },
  "finished": false
}
\`\`\`

(After creating the plan, the next action would be to add individual todos, then get the first one.)

**Example 2: Bug Investigation**
User: "The login endpoint is returning 500 errors"
Assistant:
\`\`\`json
{
  "reasoning": "A 500 error suggests a server-side issue. I need to locate the login endpoint implementation to understand its logic and dependencies. I will start by searching for relevant files.",
  "action": {
    "tool": "search_in_files",
    "args": {
      "keyword": "login|/login|POST.*login",
      "filePattern": "*.ts"
    }
  },
  "finished": false
}
\`\`\`

Remember: You are a capable, intelligent assistant focused on helping users achieve their software engineering goals efficiently and safely. Your adherence to structured planning via \`todo_manager\` is paramount.`;


// Interfaces
interface SmartAgentIteration {
    iteration: number;
    observation: string;
    thought: string;
    action: {
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
    history: SmartAgentIteration[];
}

export type SmartAgentExecutionLoopResult = {
    state: 'finished' | 'waiting_for_user' | 'error';
    error?: string;
};

@injectable()
export class SmartAgent {
    private maxIterations: number;
    private conversationHistory: Messages = [];
    private todoManager: TodoManager;
    private orchestrator: AgentOrchestrator;

    constructor(
        @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
        maxIterations: number = 50
    ) {
        this.maxIterations = maxIterations;
        this.todoManager = new TodoManager(eventEmitter);
        this.orchestrator = new AgentOrchestrator(toolAgent, eventEmitter);
        console.log('SmartAgent initialized with enhanced planning capabilities');
    }

    async runTask(initialQuery: string): Promise<TaskResult> {
        const startTime = Date.now();
        const history: SmartAgentIteration[] = [];
        this.conversationHistory = [];

        console.log(`Starting intelligent task execution: ${initialQuery}`);

        try {
            await this.initializeTaskPlanning(initialQuery);
            const loopResult = await this.executeMainLoop(initialQuery, history);
            const duration = Date.now() - startTime;
            return this.generateFinalResult(initialQuery, history, loopResult, duration);
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

    private async initializeTaskPlanning(query: string): Promise<void> {
        console.log('Initializing task planning phase...');
        const planningMessages = [
            { role: 'system' as const, content: MAIN_AGENT_PROMPT },
            {
                role: 'user' as const,
                content: `Task: ${query}\n\nAnalyze this task and create a structured approach. For complex tasks, use the todo_manager tool to create a plan.`
            }
        ];
        try {
            const response = await this.toolAgent.generateText({ messages: planningMessages, allowTools: false });
            this.conversationHistory.push(
                { role: 'user', content: planningMessages[1].content },
                { role: 'assistant', content: response }
            );
            console.log('Initial planning completed');
        } catch (error) {
            console.warn('Initial planning failed, proceeding with direct execution');
        }
    }

    private async executeMainLoop(initialQuery: string, history: SmartAgentIteration[]): Promise<SmartAgentExecutionLoopResult> {
        let iteration = 0;
        let currentObservation = `Task: ${initialQuery}`;
        let finished = false;

        while (!finished && iteration < this.maxIterations) {
            iteration++;
            console.log(`Smart Agent Iteration ${iteration}/${this.maxIterations}`);

            const iterationResult = await this.executeSingleIteration(iteration, currentObservation);

            const loopDetection = await this.orchestrator.detectLoop(this.conversationHistory);
            if (loopDetection.isLoop) {
                console.log(`Loop detected: ${loopDetection.description}`);
                finished = true;
                history.push({
                    iteration,
                    observation: currentObservation,
                    thought: 'Loop detected',
                    action: { tool: 'error', args: {}, error: loopDetection.description || 'Repetitive behavior detected' },
                    finished: true
                });
                break;
            }

            history.push(iterationResult);
            finished = iterationResult.finished;

            if (iterationResult.action.result) {
                currentObservation = `Previous: ${iterationResult.action.tool}\nResult: ${JSON.stringify(iterationResult.action.result, null, 2)}`;
            } else if (iterationResult.action.error) {
                currentObservation = `Previous: ${iterationResult.action.tool}\nError: ${iterationResult.action.error}`;
            }

            if (!finished) {
                const shouldContinue = await this.orchestrator.shouldContinue(this.conversationHistory, currentObservation);
                if (!shouldContinue) {
                    return { state: 'waiting_for_user' };
                }
            }

            const recentErrors = history.slice(-3).filter(h => h.action.error).length;
            if (recentErrors >= 2) {
                console.error('Too many consecutive errors, terminating');
                finished = true;
                return { state: 'error', error: 'Too many consecutive errors' };
            }
        }

        return { state: 'finished' };
    }

    private async executeSingleIteration(iteration: number, observation: string): Promise<SmartAgentIteration> {
        try {
            const messages: Messages = [
                { role: 'system', content: MAIN_AGENT_PROMPT },
                ...this.conversationHistory,
                { role: 'user', content: `Current observation: ${observation}` }
            ];

            const response = await this.toolAgent.generateObject<SmartAgentResponse>({
                messages,
                schema: SmartAgentResponseSchema as ZodSchema<SmartAgentResponse>
            });

            // Emit thought generated event
            this.eventEmitter.emit({
                type: 'thought_generated',
                iteration,
                thought: response.reasoning,
                context: observation,
            } as ThoughtGeneratedEvent);

            const finished = response.finished || response.action.tool === 'finish';

            this.conversationHistory.push(
                { role: 'user', content: `Observation: ${observation}` },
                { role: 'assistant', content: JSON.stringify(response, null, 2) }
            );

            let toolResult: any = null;
            let toolError: string | undefined = undefined;

            if (!finished) {
                const toolExecutionResult = await this.executeToolSafely(iteration, response.action);
                toolResult = toolExecutionResult.result;
                toolError = toolExecutionResult.error;
            } else {
                toolResult = 'Task finished';
            }

            return {
                iteration,
                observation,
                thought: response.reasoning,
                action: {
                    tool: response.action.tool,
                    args: response.action.args,
                    result: toolResult,
                    error: toolError
                },
                finished
            };
        } catch (iterationError) {
            const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
            console.error(`Iteration ${iteration} failed: ${errorMessage}`);
            return {
                iteration,
                observation,
                thought: 'Iteration error',
                action: { tool: 'error', args: {}, error: errorMessage },
                finished: true
            };
        }
    }

    private async executeToolSafely(iteration: number, action: { tool: string, args: any }): Promise<{ result?: any, error?: string }> {
        this.eventEmitter.emit({
            type: 'tool_execution_started',
            iteration,
            toolName: action.tool,
            args: action.args,
        } as ToolExecutionStartedEvent);

        try {
            const toolStartTime = Date.now();
            const toolResult = action.tool === 'start_subagent'
                ? await this.startSubAgent(action.args)
                : await this.toolAgent.executeTool(action.tool, action.args);

            const toolDuration = Date.now() - toolStartTime;

            // Emit tool call completed event
            this.eventEmitter.emit({
                type: 'tool_execution_completed',
                iteration,
                toolName: action.tool,
                success: true,
                result: toolResult,
                duration: toolDuration,
            } as ToolExecutionCompletedEvent);

            return { result: toolResult };
        } catch (toolError) {
            const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown tool error';

            // Emit tool execution completed event with error
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

    private async startSubAgent(args: any): Promise<any> {
        console.log('Starting sub-agent for specialized task');
        const subAgent = new SubAgent(this.toolAgent, this.eventEmitter);
        return await subAgent.executeTask(args);
    }

    private generateFinalResult(
        initialQuery: string,
        history: SmartAgentIteration[],
        loopResult: SmartAgentExecutionLoopResult,
        duration: number
    ): TaskResult {
        const success = loopResult.state === 'finished' && !loopResult.error && history.some(h => h.finished && !h.action.error);
        const summary = this.generateSummary(history, success);

        const result: TaskResult = {
            success,
            taskDescription: initialQuery,
            summary,
            iterations: history.length,
            duration,
            history
        };

        if (!success) {
            if (loopResult.state === 'waiting_for_user') {
                result.error = undefined;
                result.summary = 'Paused: waiting for user input/confirmation.';
            } else {
                result.error = loopResult.error || (history.length >= this.maxIterations ? 'Maximum iterations reached' : 'Task failed');
            }
        }

        console.log(`Task completed: ${success ? 'Success' : 'Failed'} in ${history.length} iterations (${duration}ms)`);
        return result;
    }

    private generateSummary(history: SmartAgentIteration[], success: boolean): string {
        if (history.length === 0) return 'No iterations completed';

        const lastIteration = history[history.length - 1];
        const toolsUsed = [...new Set(history.map(h => h.action.tool))];
        const errors = history.filter(h => h.action.error).length;

        return [
            `Task ${success ? 'completed successfully' : 'failed'} after ${history.length} iterations.`,
            `Tools used: ${toolsUsed.join(', ')}`,
            errors > 0 ? `${errors} errors encountered.` : 'No errors.',
            lastIteration.thought
        ].join(' ');
    }

    public initializeTools(): void {
        const todoTool = this.todoManager.createTool();
        this.toolAgent.registerTool('todo_manager', todoTool);
        console.log('TodoManager tool initialized for SmartAgent');
    }
}