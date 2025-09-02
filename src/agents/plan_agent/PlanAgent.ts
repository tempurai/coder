import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { ToolAgent, Message, Messages, TaskExecutionResult } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { TodoManager } from '../smart_agent/TodoManager.js';
import { InterruptService } from '../../services/InterruptService.js';
import { ToolRegistry, ToolNames } from '../../tools/ToolRegistry.js';
import { z, ZodSchema } from "zod";
import { TextGeneratedEvent, ThoughtGeneratedEvent, SystemInfoEvent } from '../../events/EventTypes.js';
import { PLAN_AGENT_PROMPT, PlanAgentResponse, PlanAgentResponseSchema } from './PlanAgentPrompt.js';

export interface PlanAgentMessage extends Message {
    iteration: number;
    phase: 'analysis' | 'exploration' | 'planning' | 'finalization';
}

interface PlanningResult {
    success: boolean;
    planSummary: string;
    recommendations: any[];
    executionPlan?: string;
    risks: string[];
    complexity: string;
    todosPrepared: boolean;
    error?: string;
}

@injectable()
export class PlanAgent {
    private maxIterations: number;
    private iterations: PlanAgentMessage[] = [];
    private todoManager: TodoManager;
    private currentPhase: 'analysis' | 'exploration' | 'planning' | 'finalization' = 'analysis';

    constructor(
        @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
        @inject(TYPES.InterruptService) private interruptService: InterruptService,
        @inject(TYPES.ToolRegistry) private toolRegistry: ToolRegistry,
        maxIterations: number = 30
    ) {
        this.maxIterations = maxIterations;
        this.todoManager = new TodoManager(eventEmitter);
    }

    async planTask(initialQuery: string, sessionHistory: Messages = []): Promise<PlanningResult> {
        this.iterations = [...sessionHistory.map((msg, i) => ({ ...msg, iteration: 0, phase: 'analysis' as const }))];

        console.log(`Starting intelligent planning mode: ${initialQuery}`);

        this.eventEmitter.emit({
            type: 'system_info',
            level: 'info',
            message: 'Plan Mode: Starting strategic analysis (no file modifications)',
            context: { mode: 'plan_only', query: initialQuery }
        } as SystemInfoEvent);

        const startTime = Date.now();

        try {
            // Initialize TodoManager for this planning session
            this.todoManager.createPlan(`Strategic Planning: ${initialQuery}`);

            const result = await this.executePlanningLoop(initialQuery);

            return {
                ...result,
                metadata: {
                    createdAt: startTime,
                    duration: Date.now() - startTime,
                }
            } as any;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                planSummary: 'Planning failed',
                recommendations: [],
                risks: [errorMessage],
                complexity: 'unknown',
                todosPrepared: false,
                error: errorMessage
            };
        }
    }

    private async executePlanningLoop(initialQuery: string): Promise<PlanningResult> {
        let iteration = 0;
        let currentObservation = `Planning Task: ${initialQuery}`;
        let planningComplete = false;
        let finalPlan: PlanAgentResponse | null = null;

        while (!planningComplete && iteration < this.maxIterations) {
            if (this.interruptService.isInterrupted()) {
                console.log('Planning interrupted by user');
                return {
                    success: false,
                    planSummary: 'Planning interrupted',
                    recommendations: [],
                    risks: ['Task was interrupted'],
                    complexity: 'unknown',
                    todosPrepared: false,
                    error: 'Planning interrupted by user'
                };
            }

            iteration++;
            console.log(`Plan Agent Iteration ${iteration}/${this.maxIterations} (Phase: ${this.currentPhase})`);

            try {
                const { response, observation, error } = await this.executeSinglePlanningIteration(iteration, currentObservation);

                if (response.readyToExecute || iteration >= this.maxIterations) {
                    planningComplete = true;
                    finalPlan = response;

                    // Create execution todos based on recommendations
                    if (response.recommendations.length > 0) {
                        for (const rec of response.recommendations) {
                            this.todoManager.addTodo({
                                title: rec.action,
                                description: rec.rationale,
                                priority: rec.priority,
                                estimatedEffort: this.estimateEffortFromComplexity(response.estimatedComplexity),
                                dependencies: rec.dependencies || [],
                                context: { phase: 'execution', fromPlanning: true }
                            });
                        }
                    }
                }

                currentObservation = observation;

                // Update planning phase based on progress
                this.updatePlanningPhase(iteration, response);

            } catch (iterationError) {
                const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
                console.error(`Planning iteration ${iteration} failed: ${errorMessage}`);

                if (iteration >= this.maxIterations - 2) {
                    break;
                }
            }
        }

        if (!finalPlan) {
            return {
                success: false,
                planSummary: 'Planning did not complete',
                recommendations: [],
                risks: ['Incomplete planning'],
                complexity: 'unknown',
                todosPrepared: false,
                error: 'Planning loop did not produce final plan'
            };
        }

        this.eventEmitter.emit({
            type: 'text_generated',
            text: `Planning completed! ${finalPlan.recommendations.length} recommendations prepared. Switch to Normal/Accept mode to execute.`,
        } as TextGeneratedEvent);

        return {
            success: true,
            planSummary: finalPlan.reasoning,
            recommendations: finalPlan.recommendations,
            executionPlan: finalPlan.executionPlan,
            risks: finalPlan.risks,
            complexity: finalPlan.estimatedComplexity,
            todosPrepared: finalPlan.recommendations.length > 0,
        };
    }

    private async executeSinglePlanningIteration(
        iteration: number,
        observation: string
    ): Promise<{ response: PlanAgentResponse; observation: string; error?: string }> {
        try {
            const messages: Messages = [
                { role: 'system', content: PLAN_AGENT_PROMPT },
                ...this.toMessages(this.iterations),
                { role: 'user', content: `Current observation: ${observation}\nPlanning Phase: ${this.currentPhase}` }
            ];

            const response = await this.toolAgent.generateObject<PlanAgentResponse>({
                messages,
                schema: PlanAgentResponseSchema as ZodSchema<PlanAgentResponse>
            });

            this.iterations.push(
                { role: 'user', content: `Observation: ${observation}`, iteration, phase: this.currentPhase },
                { role: 'assistant', content: JSON.stringify(response, null, 2), iteration, phase: this.currentPhase }
            );

            // Emit strategic thinking
            this.eventEmitter.emit({
                type: 'thought_generated',
                iteration,
                thought: response.reasoning,
                context: `Planning Phase: ${this.currentPhase}`,
            } as ThoughtGeneratedEvent);

            // Execute safe exploration actions
            let nextObservation = 'Planning analysis complete';
            if (response.explorationActions.length > 0) {
                const explorationResults = [];

                for (const action of response.explorationActions) {
                    // Validate tool is safe for plan mode
                    if (this.isSafeExplorationTool(action.tool)) {
                        const toolResult = await this.executeExplorationTool(iteration, action);
                        explorationResults.push({
                            tool: action.tool,
                            args: action.args,
                            result: toolResult.result,
                            error: toolResult.error
                        });
                    } else {
                        explorationResults.push({
                            tool: action.tool,
                            args: action.args,
                            error: `Tool ${action.tool} not allowed in Plan Mode (read-only restriction)`
                        });
                    }
                }

                const toolMessage = JSON.stringify(explorationResults, null, 2);
                this.iterations.push({
                    role: 'user',
                    content: toolMessage,
                    iteration,
                    phase: this.currentPhase
                });

                const results = explorationResults.map(tr =>
                    `${tr.tool}: ${tr.result ? JSON.stringify(tr.result) : tr.error}`
                );
                nextObservation = `Exploration results: ${results.join('; ')}`;
            }

            return { response, observation: nextObservation };

        } catch (iterationError) {
            const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown error';
            console.error(`Planning iteration ${iteration} failed: ${errorMessage}`);

            const fallbackResponse: PlanAgentResponse = {
                reasoning: 'Planning iteration encountered an error',
                observations: [errorMessage],
                recommendations: [],
                explorationActions: [],
                readyToExecute: false,
                risks: [errorMessage],
                estimatedComplexity: 'unknown'
            };

            return { response: fallbackResponse, observation: "", error: errorMessage };
        }
    }

    private isSafeExplorationTool(toolName: string): boolean {
        const safeTools = [
            ToolNames.SHELL_EXECUTOR, // Only for read-only commands
            ToolNames.GIT_STATUS,
            ToolNames.GIT_LOG,
            ToolNames.GIT_DIFF,
            ToolNames.WEB_SEARCH,
            ToolNames.URL_FETCH,
            ToolNames.FIND_FILES,
            ToolNames.TODO_MANAGER
        ];

        return safeTools.includes(toolName);
    }

    private async executeExplorationTool(
        iteration: number,
        action: { tool: string, args: any }
    ): Promise<{ result?: any, error?: string }> {
        if (this.interruptService.isInterrupted()) {
            return { error: 'Exploration interrupted by user' };
        }

        try {
            // Special validation for shell commands in plan mode
            if (action.tool === ToolNames.SHELL_EXECUTOR) {
                const command = action.args.command;
                if (this.isUnsafeShellCommand(command)) {
                    return {
                        error: `Command '${command}' not allowed in Plan Mode (potentially modifies files)`
                    };
                }
            }

            const result = await this.toolAgent.executeTool(action.tool, action.args);
            return { result };
        } catch (error) {
            return { error: error instanceof Error ? error.message : 'Unknown exploration error' };
        }
    }

    private isUnsafeShellCommand(command: string): boolean {
        const writeCommands = [
            'rm', 'mv', 'cp', 'mkdir', 'touch', 'echo', 'printf', 'tee',
            'sed -i', 'awk', 'npm install', 'yarn add', 'git commit', 'git push'
        ];

        const cmd = command.toLowerCase().trim();
        return writeCommands.some(writeCmd =>
            cmd.includes(writeCmd) || cmd.includes('>') || cmd.includes('>>')
        );
    }

    private updatePlanningPhase(iteration: number, response: PlanAgentResponse): void {
        // Automatically progress through planning phases
        if (iteration <= 3) {
            this.currentPhase = 'analysis';
        } else if (iteration <= 8) {
            this.currentPhase = 'exploration';
        } else if (iteration <= 15) {
            this.currentPhase = 'planning';
        } else {
            this.currentPhase = 'finalization';
        }
    }

    private estimateEffortFromComplexity(complexity: string): number {
        switch (complexity) {
            case 'low': return 2;
            case 'medium': return 5;
            case 'high': return 7;
            case 'very_high': return 9;
            default: return 5;
        }
    }

    private toMessages(planAgentMessages: PlanAgentMessage[]): Messages {
        return planAgentMessages.map(m => ({ role: m.role, content: m.content }));
    }

    public initializeTools(): void {
        // Register TodoManager tool for plan mode
        const todoTool = this.todoManager.createTool();
        this.toolRegistry.register({ name: ToolNames.TODO_MANAGER, tool: todoTool });
    }

    public getTodoManager(): TodoManager {
        return this.todoManager;
    }

    public getCurrentPhase(): string {
        return this.currentPhase;
    }

    public getIterationCount(): number {
        return this.iterations.length;
    }
}