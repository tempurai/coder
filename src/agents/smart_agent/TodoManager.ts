import { z } from 'zod';
import { tool } from 'ai';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { TextGeneratedEvent } from '../../events/EventTypes.js';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../di/types.js';

interface TodoItem {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
    priority: 'high' | 'medium' | 'low';
    estimatedEffort: number;
    dependencies: string[];
    context?: any;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
}

interface TaskPlan {
    id: string;
    summary: string;
    totalEstimatedTime: number;
    todos: TodoItem[];
    createdAt: Date;
}

@injectable()
export class TodoManager {
    private todos: Map<string, TodoItem> = new Map();
    private plan: TaskPlan | null = null;
    private nextId: number = 1;

    constructor(@inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter) { }

    public createTool() {
        return tool({
            description: `Manages a structured task list for the current objective. This is your primary tool for planning and tracking progress on any non-trivial task.
## Core Function
Use this tool to create a plan, add/update tasks, and track progress. It is ESSENTIAL for any task requiring more than two steps.

## When to Use This Tool (MANDATORY)
- **Initial Planning**: After understanding a user's request, if it's complex, your FIRST action MUST be to create a plan (\`action: 'create_plan'\`) and then add tasks (\`action: 'add_todo'\`).
- **Discovering New Work**: When a tool's output (e.g., \`search_in_files\`) reveals multiple files to edit or steps to take, add each as a distinct todo.
- **Executing the Plan**:
    1. Get your next task with \`action: 'get_next'\`.
    2. Mark it \`in_progress\` with \`action: 'update_status'\` BEFORE you start working on it.
    3. After successfully completing the work, mark it \`completed\` IMMEDIATELY. Do not batch completions.
- **Handling Blockers**: If a task cannot be completed, mark it as \`blocked\` and add a new todo to resolve the blocker.

## When NOT to Use This Tool
- For single, simple tasks (e.g., "read this one file", "run 'ls -l'").
- For purely conversational or informational responses.

## Example Workflow
1. User: "Refactor the auth service to use JWT."
2. YOU: Call \`todo_manager({ action: 'create_plan', summary: 'Refactor auth service to use JWT' })\`.
3. YOU: Call \`todo_manager({ action: 'add_todo', title: 'Identify all files using the old auth service' })\`.
4. YOU: Call \`todo_manager({ action: 'add_todo', title: 'Replace old auth logic with JWT implementation' })\`.
5. YOU: Call \`todo_manager({ action: 'get_next' })\` -> Returns the "Identify files" todo.
6. YOU: Call \`todo_manager({ action: 'update_status', todoId: '...', status: 'in_progress' })\`.
7. YOU: Call \`search_in_files(...)\`.
8. YOU: Call \`todo_manager({ action: 'update_status', todoId: '...', status: 'completed' })\`.
`,
            inputSchema: z.object({
                action: z.enum(['create_plan', 'add_todo', 'update_status', 'get_next', 'get_progress', 'list_all']),
                summary: z.string().optional().describe('A concise summary of the overall task for \'create_plan\' action.'),
                title: z.string().optional().describe('A short, actionable title for the todo item for \'add_todo\' action.'),
                description: z.string().optional().describe('A detailed description of what needs to be done for a todo item.'),
                priority: z.enum(['high', 'medium', 'low']).default('medium').optional(),
                estimatedEffort: z.number().min(1).max(10).default(3).optional().describe('An effort estimate from 1 (very easy) to 10 (very complex).'),
                dependencies: z.array(z.string()).default([]).optional().describe('An array of todo IDs that this new todo depends on.'),
                todoId: z.string().optional().describe('The ID of the todo to update for \'update_status\' action.'),
                status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'skipped']).optional().describe('The new status for the todo item.'),
                context: z.any().optional().describe('Any additional JSON-serializable context or data relevant to the todo.')
            }),
            execute: async (args) => {
                // ... (The rest of the `execute` logic remains unchanged as it is functionally correct)
                switch (args.action) {
                    case 'create_plan':
                        return this.createPlan(args.summary || 'Untitled Plan');
                    case 'add_todo':
                        if (!args.title) {
                            return { success: false, error: 'Title is required for add_todo' };
                        }
                        return this.addTodo({
                            title: args.title,
                            description: args.description || '',
                            priority: args.priority || 'medium',
                            estimatedEffort: args.estimatedEffort || 3,
                            dependencies: args.dependencies || [],
                            context: args.context
                        });
                    case 'update_status':
                        if (!args.todoId || !args.status) {
                            return { success: false, error: 'todoId and status are required for update_status' };
                        }
                        return this.updateTodoStatus(args.todoId, args.status);
                    case 'get_next':
                        return this.getNextTodo();
                    case 'get_progress':
                        return this.getProgress();
                    case 'list_all':
                        return this.listAllTodos();
                    default:
                        return { success: false, error: 'Unknown action' };
                }
            }
        });
    }

    public createPlan(summary: string) {
        this.plan = {
            id: `plan-${Date.now()}`,
            summary,
            totalEstimatedTime: 0,
            todos: [],
            createdAt: new Date()
        };

        this.eventEmitter.emit({
            type: 'text_generated',
            text: summary,
        } as TextGeneratedEvent);

        return {
            success: true,
            planId: this.plan.id,
            summary,
            message: 'Task plan created successfully. You should now add todos to this plan.'
        };
    }

    public addTodo(todoData: {
        title: string;
        description: string;
        priority: 'high' | 'medium' | 'low';
        estimatedEffort: number;
        dependencies: string[];
        context?: any;
    }) {
        const todo: TodoItem = {
            id: `todo-${this.nextId++}`,
            title: todoData.title,
            description: todoData.description,
            status: 'pending',
            priority: todoData.priority,
            estimatedEffort: todoData.estimatedEffort,
            dependencies: todoData.dependencies,
            context: todoData.context,
            createdAt: new Date()
        };
        this.todos.set(todo.id, todo);
        if (this.plan) {
            this.plan.todos.push(todo);
            this.plan.totalEstimatedTime += todo.estimatedEffort;
        }

        console.log(`Added todo: ${todo.title} (${todo.priority} priority)`);
        // this.eventEmitter.emit({
        //     type: 'text_generated',
        //     text: `Todo "${todo.title}" added`
        // } as TextGeneratedEvent);

        return {
            success: true,
            todoId: todo.id,
            title: todo.title,
            message: `Todo "${todo.title}" added successfully`
        };
    }

    private updateTodoStatus(todoId: string, status: TodoItem['status']) {
        const todo = this.todos.get(todoId);
        if (!todo) {
            return { success: false, error: `Todo with ID ${todoId} not found` };
        }
        const oldStatus = todo.status;
        todo.status = status;

        if (status === 'in_progress' && !todo.startedAt) {
            todo.startedAt = new Date();
        } else if (status === 'completed' && !todo.completedAt) {
            todo.completedAt = new Date();
        }

        this.eventEmitter.emit({
            type: 'text_generated',
            text: `Todo "${todo.title}" status updated: ${oldStatus} → ${status}`
        } as TextGeneratedEvent);

        return {
            success: true,
            todoId: todo.id,
            title: todo.title,
            oldStatus,
            newStatus: status,
            message: `Todo "${todo.title}" status updated to ${status}`
        };
    }

    private getNextTodo() {
        const executable = Array.from(this.todos.values())
            .filter(todo => todo.status === 'pending')
            .filter(todo => this.allDependenciesCompleted(todo.id))
            .sort((a, b) => this.calculatePriority(b) - this.calculatePriority(a));

        if (executable.length === 0) {
            const inProgress = Array.from(this.todos.values()).filter(t => t.status === 'in_progress');
            if (inProgress.length > 0) {
                return {
                    success: true,
                    nextTodo: null,
                    inProgress: inProgress.map(t => ({ id: t.id, title: t.title })),
                    message: 'No new actionable todos. Continue with items already in progress.'
                };
            }

            const completed = Array.from(this.todos.values()).filter(t => t.status === 'completed');
            const total = this.todos.size;
            if (completed.length === total && total > 0) {
                return {
                    success: true,
                    nextTodo: null,
                    allCompleted: true,
                    message: 'All todos completed! 🎉 Task is likely finished.'
                };
            }

            return {
                success: true,
                nextTodo: null,
                message: 'No executable todos available. Check for blocked tasks or add new todos.'
            };
        }

        const nextTodo = executable[0];
        return {
            success: true,
            nextTodo: {
                id: nextTodo.id,
                title: nextTodo.title,
                description: nextTodo.description,
                priority: nextTodo.priority,
                estimatedEffort: nextTodo.estimatedEffort,
                context: nextTodo.context
            },
            message: `Next todo to execute: "${nextTodo.title}"`
        };
    }

    private getProgress() {
        const todos = Array.from(this.todos.values());
        const completed = todos.filter(t => t.status === 'completed');
        const inProgress = todos.filter(t => t.status === 'in_progress');
        const pending = todos.filter(t => t.status === 'pending');
        const blocked = todos.filter(t => t.status === 'blocked');
        const completionPercentage = todos.length > 0
            ? Math.round((completed.length / todos.length) * 100)
            : 0;

        return {
            success: true,
            progress: {
                total: todos.length,
                completed: completed.length,
                inProgress: inProgress.length,
                pending: pending.length,
                blocked: blocked.length,
                completionPercentage,
            },
            summary: `${completed.length}/${todos.length} todos completed (${completionPercentage}%)`,
            plan: this.plan ? {
                id: this.plan.id,
                summary: this.plan.summary,
            } : null
        };
    }

    private listAllTodos() {
        const todos = Array.from(this.todos.values())
            .sort((a, b) => {
                const statusOrder = { 'in_progress': 0, 'pending': 1, 'blocked': 2, 'completed': 3, 'skipped': 4 };
                const statusDiff = statusOrder[a.status] - statusOrder[b.status];
                if (statusDiff !== 0) return statusDiff;
                return a.createdAt.getTime() - b.createdAt.getTime();
            });

        return {
            success: true,
            todos: todos.map(todo => ({
                id: todo.id,
                title: todo.title,
                status: todo.status,
                priority: todo.priority,
                dependencies: todo.dependencies,
            })),
            count: todos.length,
        };
    }

    private allDependenciesCompleted(todoId: string): boolean {
        const todo = this.todos.get(todoId);
        if (!todo) return false;
        return todo.dependencies.every(depId => {
            const dep = this.todos.get(depId);
            return dep?.status === 'completed';
        });
    }

    private calculatePriority(todo: TodoItem): number {
        let score = 0;
        if (todo.priority === 'high') score += 10;
        else if (todo.priority === 'medium') score += 5;
        const blockedCount = Array.from(this.todos.values())
            .filter(t => t.dependencies.includes(todo.id) && t.status === 'pending')
            .length;
        score += blockedCount * 2;
        return score;
    }

    public getPlan(): TaskPlan | null {
        return this.plan;
    }

    public getAllTodos(): TodoItem[] {
        return Array.from(this.todos.values());
    }
}