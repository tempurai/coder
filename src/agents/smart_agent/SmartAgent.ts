import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { TodoManager } from './TodoManager.js';
import { SubAgent } from './SubAgent.js';
import { InterruptService } from '../../services/InterruptService.js';
import { z, ZodSchema } from "zod";
import { ThoughtGeneratedEvent, ToolExecutionCompletedEvent, ToolExecutionStartedEvent } from '../../events/EventTypes.js';

export const PlanningResponseSchema = z.object({
    analysis: z.string().describe("Analysis of the task complexity and requirements"),
    approach: z.string().describe("Overall approach to solve this task"),
    todos: z.array(z.object({
        title: z.string().describe("Title of the todo item"),
        description: z.string().describe("Detailed description of the todo item"),
        priority: z.enum(['high', 'medium', 'low']).describe("Priority level of the todo item"),
        estimatedEffort: z.number().min(1).max(10).describe("Estimated effort to complete the todo item"),
        context: z.any().optional().describe("Any additional context or information relevant to the todo item")
    })),
    needsPlanning: z.boolean().describe("Whether this task requires structured planning with todos")
});

export type PlanningResponse = z.infer<typeof PlanningResponseSchema>;

export const PLANNING_PROMPT = `
You are the task planner for Tempurai Code. Your job is to analyze the user's request and create an execution plan.  

# Your Role
- Analyze the complexity and requirements of the task.  
- Define a clear solution strategy.  
- Break down the task into concrete business-oriented goals.  
- Decide whether structured planning is required.  

# Todo Granularity Guidelines
A **good todo item** should describe a clear business-level goal, not an implementation detail.  

**Good examples**:
- "Analyze the JWT implementation logic in src/auth.ts"
- "Add a rate-limiting middleware to the API routes"
- "Fix TypeScript type errors in the login component"
- "Create a utility function for user permission validation"

**Bad examples**:
- "Call the read_file tool" (too implementation-specific, not business-level)
- "Use search_in_files to find code" (too technical, not outcome-oriented)
- "Run a shell command" (too vague and low-level)

# Response Format
You must respond in this JSON format:
\`\`\`json
{
  "analysis": "Analysis of the task and its complexity",
  "approach": "Proposed solution strategy",
  "todos": [
    {
      "title": "Concise task title",
      "description": "Detailed description of the business goal to achieve",
      "priority": "high|medium|low",
      "estimatedEffort": 1-10,
      "context": "Any additional context or information relevant to the todo item"
    }
  ],
  "needsPlanning": true/false
}
\`\`\`

# Deciding if Planning is Needed
- **needsPlanning = true**: The task involves multiple steps, touches multiple files, or requires complex refactoring.  
- **needsPlanning = false**: The task is simple (e.g., a quick query, a single file edit, or a small check).  

Analyze the user’s task and output the planning JSON.
`;


export const SmartAgentResponseSchema = z.object({
    reasoning: z.string().describe("Description of the reasoning behind the chosen actions"),
    actions: z.array(z.object({
        tool: z.string().describe("Name of the tool to be invoked"),
        args: z.record(z.any()).default({})
    })).describe("Array of tools to execute in sequence"),
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

# Multi-Tool Execution
You can execute multiple related tools in a single response using the actions array:
- Group logically related tools together (e.g., read_file + search_in_files)
- Execute todo_manager operations in sequence (create_plan + add_todo + add_todo)
- Combine investigation tools for comprehensive analysis

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
  "reasoning": "This is a complex task requiring understanding the current API structure, choosing a rate limiting strategy, implementing it as middleware, and applying it to all endpoints. I must start by creating a structured plan.",
  "actions": [
    {
      "tool": "todo_manager",
      "args": {
        "action": "create_plan",
        "summary": "Implement rate limiting for all API endpoints"
      }
    },
    {
      "tool": "todo_manager",
      "args": {
        "action": "add_todo",
        "title": "Analyze current API structure and endpoints",
        "description": "Find all API endpoints and understand current middleware setup"
      }
    },
    {
      "tool": "todo_manager", 
      "args": {
        "action": "add_todo",
        "title": "Choose and implement rate limiting strategy",
        "description": "Select appropriate rate limiting library and create middleware"
      }
    }
  ],
  "finished": false
}
\`\`\`

**Example 2: Project Analysis**
User: "What is this project about?"
Assistant:
\`\`\`json
{
  "reasoning": "To understand this project, I need to examine the README, package.json, and main source files to get a comprehensive overview.",
  "actions": [
    {
      "tool": "read_file",
      "args": {
        "filePath": "README.md"
      }
    },
    {
      "tool": "read_file", 
      "args": {
        "filePath": "package.json"
      }
    },
    {
      "tool": "find_files",
      "args": {
        "pattern": "src"
      }
    }
  ],
  "finished": false
}
\`\`\`

Remember: You are a capable, intelligent assistant focused on helping users achieve their software engineering goals efficiently and safely. Your adherence to structured planning via \`todo_manager\` is paramount.`;

interface SmartAgentIteration {
    iteration: number;
    observation: string;
    thought: string;
    actions: {
        tool: string;
        args: any;
        result?: any;
        error?: string;
    }[];
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
    state: 'finished' | 'waiting_for_user' | 'error' | 'interrupted';
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
        @inject(TYPES.InterruptService) private interruptService: InterruptService,
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

    private async executeMainLoop(initialQuery: string, history: SmartAgentIteration[]): Promise<SmartAgentExecutionLoopResult> {
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

            const iterationResult = await this.executeSingleIteration(iteration, currentObservation);

            // Only check for loops every 5 iterations to avoid false positives
            if (iteration % 5 === 0) {
                const loopDetection = await this.orchestrator.detectLoop(this.conversationHistory);
                if (loopDetection.isLoop) {
                    console.log(`Loop detected: ${loopDetection.description}`);
                    finished = true;
                    history.push({
                        iteration,
                        observation: currentObservation,
                        thought: 'Loop detected',
                        actions: [{ tool: 'error', args: {}, error: loopDetection.description || 'Repetitive behavior detected' }],
                        finished: true
                    });
                    break;
                }
            }

            history.push(iterationResult);
            finished = iterationResult.finished;

            // Update observation based on action results
            const actionResults = iterationResult.actions
                .map(action => `${action.tool}: ${action.result ? JSON.stringify(action.result) : action.error}`)
                .join('; ');
            currentObservation = `Previous actions: ${actionResults}`;

            if (!finished) {
                const shouldContinue = await this.orchestrator.shouldContinue(this.conversationHistory, currentObservation);
                if (!shouldContinue) {
                    return { state: 'waiting_for_user' };
                }
            }

            const recentErrors = history.slice(-3).filter(h => h.actions.some(a => a.error)).length;
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
            if (this.interruptService.isInterrupted()) {
                return {
                    iteration,
                    observation,
                    thought: 'Task interrupted by user',
                    actions: [{ tool: 'interrupt', args: {}, result: 'Task interrupted' }],
                    finished: true
                };
            }

            const messages: Messages = [
                { role: 'system', content: MAIN_AGENT_PROMPT },
                ...this.conversationHistory,
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

            const finished = response.finished;

            this.conversationHistory.push(
                { role: 'user', content: `Observation: ${observation}` },
                { role: 'assistant', content: JSON.stringify(response, null, 2) }
            );

            const actionResults: { tool: string; args: any; result?: any; error?: string }[] = [];

            if (!finished) {
                // Execute all actions in sequence
                for (const action of response.actions) {
                    const toolExecutionResult = await this.executeToolSafely(iteration, action);
                    actionResults.push({
                        tool: action.tool,
                        args: action.args,
                        result: toolExecutionResult.result,
                        error: toolExecutionResult.error
                    });
                }
            } else {
                actionResults.push({
                    tool: 'finish',
                    args: {},
                    result: 'Task finished'
                });
            }

            return {
                iteration,
                observation,
                thought: response.reasoning,
                actions: actionResults,
                finished
            };

        } catch (iterationError) {
            const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
            console.error(`Iteration ${iteration} failed: ${errorMessage}`);
            return {
                iteration,
                observation,
                thought: 'Iteration error',
                actions: [{ tool: 'error', args: {}, error: errorMessage }],
                finished: true
            };
        }
    }

    private async executeToolSafely(iteration: number, action: { tool: string, args: any }): Promise<{ result?: any, error?: string }> {
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

            return { result: toolResult };
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
        const success = loopResult.state === 'finished' && !loopResult.error && history.some(h => h.finished && !h.actions.some(a => a.error));
        const summary = this.generateSummary(history, success, loopResult.state);

        const result: TaskResult = {
            success,
            taskDescription: initialQuery,
            summary,
            iterations: history.length,
            duration,
            history
        };

        if (!success) {
            if (loopResult.state === 'interrupted') {
                result.error = undefined;
                result.summary = 'Task interrupted by user.';
            } else if (loopResult.state === 'waiting_for_user') {
                result.error = undefined;
                result.summary = 'Paused: waiting for user input/confirmation.';
            } else {
                result.error = loopResult.error || (history.length >= this.maxIterations ? 'Maximum iterations reached' : 'Task failed');
            }
        }

        console.log(`Task completed: ${success ? 'Success' : loopResult.state === 'interrupted' ? 'Interrupted' : 'Failed'} in ${history.length} iterations (${duration}ms)`);
        return result;
    }

    private generateSummary(history: SmartAgentIteration[], success: boolean, state: string): string {
        if (history.length === 0) return 'No iterations completed';

        const lastIteration = history[history.length - 1];
        const toolsUsed = [...new Set(history.flatMap(h => h.actions.map(a => a.tool)))];
        const errors = history.filter(h => h.actions.some(a => a.error)).length;

        if (state === 'interrupted') {
            return [
                `Task interrupted after ${history.length} iterations.`,
                `Tools used: ${toolsUsed.join(', ')}`,
                errors > 0 ? `${errors} errors encountered.` : 'No errors.',
            ].join(' ');
        }

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