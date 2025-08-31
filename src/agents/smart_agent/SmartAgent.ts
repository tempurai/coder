import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { TodoManager } from './TodoManager.js';
import { createSubAgentTool, SubAgent } from './SubAgent.js';
import { InterruptService } from '../../services/InterruptService.js';
import { z, ZodSchema } from "zod";
import { TextGeneratedEvent, ThoughtGeneratedEvent, ToolExecutionCompletedEvent, ToolExecutionStartedEvent } from '../../events/EventTypes.js';

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
- "Run a shell command" (too vague and low-level): 'ls -la', 'cat file.txt'

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

# Tool Usage Priority (CRITICAL)
- **Shell Commands First**: For common operations like listing files (ls), checking status (git status), finding files (find), prefer shell_executor over specialized tools
- **Shell for Exploration**: Use shell commands to explore project structure, check file existence, run builds/tests
- **Shell for Testing and Validation**: Use shell commands to run tests, check code quality, and validate changes
- **Batch Commands Preferred**: When you need to run multiple related commands, use multi_command to execute them efficiently in sequence
- **Examples of shell-first approach**:
  - File exploration: \`ls -la\`, \`find . -name "*.ts" -type f\`, \`tree\`
  - Code analysis: \`grep -r "function" src/\`, \`cat src/main.ts\`
  - Project understanding: \`ls && cat package.json && find . -name "*.config.*"\`
  - Git operations: \`git status && git log --oneline -5\`
  - Build and test: \`npm run build && npm test\`

# Multi-Tool Execution
You can execute multiple related tools in a single response using the actions array:
- Group logically related tools together
- Execute todo_manager operations in sequence (create_plan + add_todo + add_todo)
- Combine investigation tools for comprehensive analysis
- Use multi_command for sequential shell operations

# Primary Workflow
Follow this proven methodology for all software engineering tasks:
1.  **Understand**:
    - Analyze the user's request thoroughly.
    - Use \`ls -al\`, \`find\`, and \`cat\` command etc to understand the current codebase.
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
  "finished": false,
  "result": "Final task completion summary and key outcomes (ONLY when finished=true)"
}
\`\`\`

**Important**: Set "finished": true and provide "result" ONLY when the entire user request has been completely fulfilled and all todos are marked as 'completed'. The "result" field should contain a concise summary of what was accomplished.

# Example Interactions

**Example 1: Project Analysis**
User: "What is this project about?"
Assistant:
\`\`\`json
{
  "reasoning": "To understand this project, I need to examine the package.json, README, and main source structure to get a comprehensive overview. I'll start with basic exploration commands.",
  "actions": [
    {
      "tool": "multi_command",
      "args": {
        "commands": [
          {
            "command": "ls -la",
            "description": "List all files and directories in the project root"
          },
          {
            "command": "cat package.json",
            "description": "Read package.json to understand project dependencies and scripts"
          },
          {
            "command": "find . -name 'README*' -o -name '*.md' | head -5",
            "description": "Find documentation files"
          }
        ]
      }
    }
  ],
  "finished": false
}
\`\`\`

**Example 2: Complex Feature Implementation**
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
        "description": "Find all API endpoints and understand current middleware setup",
        "priority": "high"
      }
    },
    {
      "tool": "todo_manager", 
      "args": {
        "action": "add_todo",
        "title": "Choose and implement rate limiting strategy",
        "description": "Select appropriate rate limiting library and create middleware",
        "priority": "high"
      }
    },
    {
      "tool": "todo_manager",
      "args": {
        "action": "add_todo", 
        "title": "Apply rate limiting to all endpoints",
        "description": "Update all route handlers to use the new rate limiting middleware",
        "priority": "medium"
      }
    },
    {
      "tool": "todo_manager",
      "args": {
        "action": "add_todo",
        "title": "Test rate limiting functionality",
        "description": "Write tests and manually verify rate limiting works correctly",
        "priority": "medium"
      }
    }
  ],
  "finished": false
}
\`\`\`

**Example 3: File Operations and Git Workflow**
User: "Fix the TypeScript errors in the auth module"
Assistant:
\`\`\`json
{
  "reasoning": "I need to find TypeScript errors in the auth module. I'll start by running the TypeScript compiler to see what errors exist, then locate the auth module files.",
  "actions": [
    {
      "tool": "multi_command",
      "args": {
        "commands": [
          {
            "command": "find . -name '*auth*' -type f | grep -E '\\.(ts|tsx)$'",
            "description": "Find all TypeScript files related to auth"
          },
          {
            "command": "npx tsc --noEmit",
            "description": "Run TypeScript compiler to identify errors"
          }
        ]
      }
    }
  ],
  "finished": false
}
\`\`\`

**Example 4: Task Completion**
Assistant (in final iteration):
\`\`\`json
{
  "reasoning": "All todos have been completed successfully. The rate limiting middleware has been implemented, applied to all endpoints, and tested. The implementation is working correctly.",
  "actions": [
    {
      "tool": "todo_manager",
      "args": {
        "action": "get_progress"
      }
    }
  ],
  "finished": true,
  "result": "Successfully implemented rate limiting for all API endpoints. Added express-rate-limit middleware, configured with 100 requests per 15 minutes window, applied to all routes, and verified through both unit tests and manual testing. All TypeScript errors resolved."
}
\`\`\`

**Example 5: File Analysis and Batch Operations**
User: "Update all the import statements in the src directory to use absolute imports"
Assistant:
\`\`\`json
{
  "reasoning": "This requires finding all TypeScript files, analyzing their import statements, and updating them systematically. I'll use shell commands to explore the structure first.",
  "actions": [
    {
      "tool": "shell_executor",
      "args": {
        "command": "find src -name '*.ts' -o -name '*.tsx' | head -20",
        "description": "Find TypeScript files in src directory to understand the scope"
      }
    },
    {
      "tool": "shell_executor", 
      "args": {
        "command": "grep -r 'import.*\\.\\./' src/ | head -10",
        "description": "Find examples of relative imports that need to be converted"
      }
    }
  ],
  "finished": false
}
\`\`\`

Remember: You are a capable, intelligent assistant focused on helping users achieve their software engineering goals efficiently and safely. Your adherence to structured planning via \`todo_manager\` and shell-first approach for exploration is paramount.`;


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
    }

    async runTask(initialQuery: string): Promise<TaskResult> {
        const startTime = Date.now();
        const iterations: SmartAgentIteration[] = [];
        this.conversationHistory = [];

        console.log(`Starting intelligent task execution: ${initialQuery}`);

        try {
            const executionResult = await this.executeMainLoop(initialQuery, iterations);
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

            const iterationResult = await this.executeSingleIteration(iteration, currentObservation);

            // Check for loops every 5 iterations
            if (iteration % 5 === 0) {
                const loopDetection = await this.orchestrator.detectLoop(this.conversationHistory);
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
                const shouldContinue = await this.orchestrator.shouldContinue(this.conversationHistory, currentObservation);
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

    private async executeSingleIteration(iteration: number, observation: string): Promise<SmartAgentIteration> {
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

            // Update conversation history
            this.conversationHistory.push(
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
        this.toolAgent.registerTool('todo_manager', todoTool);

        const subAgentTool = createSubAgentTool(this.toolAgent, this.eventEmitter);
        this.toolAgent.registerTool('start_subagent', subAgentTool);
    }
}