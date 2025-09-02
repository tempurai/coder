import { useState, useEffect, useCallback } from 'react';
import { SessionService } from '../../services/SessionService.js';
import { UIEvent, UIEventType, ToolConfirmationResponseEvent } from '../../events/index.js';
import { ConfirmationChoice } from '../../services/HITLManager.js';

export interface PendingConfirmation {
    confirmationId: string;
    toolName: string;
    args: any;
    description: string;
    options?: {
        showRememberOption?: boolean;
        defaultChoice?: 'yes' | 'no' | 'yes_and_remember';
        timeout?: number;
    };
}

export interface ToolExecutionState {
    startEvent?: UIEvent;
    outputEvents: UIEvent[];
    completedEvent?: UIEvent;
    currentStatus: 'started' | 'executing' | 'completed' | 'failed';
}

export interface TodoState {
    current?: {
        id: string;
        title: string;
    };
    next?: {
        id: string;
        title: string;
    };
}

export interface ErrorState {
    errors: string[];
    lastErrorTime?: Date;
}

export const useSessionEvents = (sessionService: SessionService) => {
    const [events, setEvents] = useState<UIEvent[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [currentActivity, setCurrentActivity] = useState<string>('');
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
    const [toolExecutions, setToolExecutions] = useState<Map<string, ToolExecutionState>>(new Map());
    const [todoState, setTodoState] = useState<TodoState>({});
    const [errorState, setErrorState] = useState<ErrorState>({ errors: [] });

    const mergeToolExecutionEvents = useCallback((toolExecutionId: string): UIEvent | null => {
        const state = toolExecutions.get(toolExecutionId);
        if (!state || !state.startEvent) return null;

        const mergedEvent: any = {
            ...state.startEvent,
            type: state.startEvent.type,
        };

        if (state.completedEvent) {
            mergedEvent.completedData = state.completedEvent;
        }
        if (state.outputEvents.length > 0) {
            mergedEvent.outputData = state.outputEvents;
        }
        mergedEvent.executionStatus = state.currentStatus;
        return mergedEvent;
    }, [toolExecutions]);

    const extractTodoState = useCallback((events: UIEvent[]): TodoState => {
        const todoEvents = events.filter(event =>
            event.type === UIEventType.ToolExecutionCompleted &&
            (event as any).toolName === 'todo_manager'
        );

        let current: { id: string; title: string } | undefined;
        let next: { id: string; title: string } | undefined;

        for (const event of todoEvents.reverse()) {
            const result = (event as any).result;
            if (result && result.nextTodo) {
                current = result.nextTodo;
                break;
            }
        }

        // Find next todo from the same events
        for (const event of todoEvents.reverse()) {
            const result = (event as any).result;
            if (result && result.todos) {
                const pendingTodos = result.todos.filter((t: any) => t.status === 'pending');
                if (pendingTodos.length > 1) {
                    next = pendingTodos[1];
                    break;
                }
            }
        }

        return { current, next };
    }, []);

    useEffect(() => {
        const eventEmitter = sessionService.events;
        let eventBuffer: UIEvent[] = [];
        let batchTimeout: NodeJS.Timeout | null = null;

        const flushEvents = () => {
            if (eventBuffer.length > 0) {
                const toolEvents = eventBuffer.filter(event =>
                    event.type === UIEventType.ToolExecutionStarted ||
                    event.type === UIEventType.ToolExecutionOutput ||
                    event.type === UIEventType.ToolExecutionCompleted
                );
                const otherEvents = eventBuffer.filter(event =>
                    event.type !== UIEventType.ToolExecutionStarted &&
                    event.type !== UIEventType.ToolExecutionOutput &&
                    event.type !== UIEventType.ToolExecutionCompleted
                );

                setToolExecutions(prev => {
                    const newMap = new Map(prev);
                    toolEvents.forEach(event => {
                        const toolExecutionId = (event as any).toolExecutionId;
                        if (!toolExecutionId) return;

                        const existing = newMap.get(toolExecutionId) || {
                            outputEvents: [],
                            currentStatus: 'started' as const
                        };

                        if (event.type === UIEventType.ToolExecutionStarted) {
                            existing.startEvent = event;
                            existing.currentStatus = 'started';
                        } else if (event.type === UIEventType.ToolExecutionOutput) {
                            existing.outputEvents.push(event);
                            existing.currentStatus = 'executing';
                        } else if (event.type === UIEventType.ToolExecutionCompleted) {
                            if (existing.startEvent) {
                                existing.completedEvent = event;
                                existing.currentStatus = (event as any).success ? 'completed' : 'failed';
                            } else {
                                return;
                            }
                        }

                        newMap.set(toolExecutionId, existing);
                    });
                    return newMap;
                });

                setEvents((prevEvents) => {
                    const newEvents = [...prevEvents];

                    otherEvents.forEach(event => {
                        newEvents.push(event);
                    });

                    toolEvents.forEach(event => {
                        const toolExecutionId = (event as any).toolExecutionId;
                        if (!toolExecutionId) return;

                        if (event.type === UIEventType.ToolExecutionStarted) {
                            newEvents.push(event);
                        } else if (event.type === UIEventType.ToolExecutionCompleted) {
                            const existingIndex = newEvents.findIndex(e =>
                                (e as any).toolExecutionId === toolExecutionId &&
                                e.type === UIEventType.ToolExecutionStarted
                            );
                            if (existingIndex !== -1) {
                                const updatedEvent = {
                                    ...newEvents[existingIndex],
                                    completedData: event,
                                    executionStatus: (event as any).success ? 'completed' : 'failed'
                                };
                                newEvents[existingIndex] = updatedEvent as UIEvent;
                            }
                        }
                    });

                    return newEvents;
                });

                // Update todo state
                const allEvents = [...events, ...eventBuffer];
                setTodoState(extractTodoState(allEvents));

                eventBuffer = [];
            }
            batchTimeout = null;
        };

        const handleEvent = (event: UIEvent) => {
            if (pendingConfirmation) {
                return;
            }

            eventBuffer.push(event);

            if (batchTimeout) {
                clearTimeout(batchTimeout);
            }
            batchTimeout = setTimeout(flushEvents, 16);

            switch (event.type) {
                case UIEventType.TaskStart:
                    setIsProcessing(true);
                    setCurrentActivity('Processing...');
                    // Clear errors when new task starts
                    setErrorState({ errors: [] });
                    break;
                case UIEventType.TaskComplete:
                    setTimeout(() => {
                        setIsProcessing(false);
                        setCurrentActivity('');
                        setTodoState({});
                    }, 500);
                    break;
                case UIEventType.SystemInfo:
                    const systemEvent = event as any;
                    if (systemEvent.level === 'error') {
                        setErrorState(prev => ({
                            errors: [...prev.errors, systemEvent.message].slice(-3),
                            lastErrorTime: new Date()
                        }));
                    }
                    break;
                case UIEventType.ToolConfirmationRequest:
                    const confirmEvent = event as any;
                    setPendingConfirmation({
                        confirmationId: confirmEvent.confirmationId,
                        toolName: confirmEvent.toolName,
                        args: confirmEvent.args,
                        description: confirmEvent.description,
                        options: confirmEvent.options,
                    });
                    break;
                case UIEventType.ToolConfirmationResponse:
                    setPendingConfirmation(null);
                    break;
                case UIEventType.ToolExecutionStarted:
                    // Clear errors when new tool execution starts
                    if (errorState.errors.length > 0) {
                        setErrorState({ errors: [] });
                    }
                    break;
            }
        };

        const subscription = eventEmitter.onAll(handleEvent);

        return () => {
            subscription.unsubscribe();
            if (batchTimeout) {
                clearTimeout(batchTimeout);
            }
            flushEvents();
        };
    }, [sessionService, pendingConfirmation, mergeToolExecutionEvents, extractTodoState, errorState.errors, events]);

    const handleConfirmation = useCallback(
        (confirmationId: string, choice: 'yes' | 'no' | 'yes_and_remember') => {
            if (pendingConfirmation?.confirmationId === confirmationId) {
                sessionService.events.emit({
                    type: 'tool_confirmation_response',
                    confirmationId,
                    approved: choice === ConfirmationChoice.YES || choice === ConfirmationChoice.YES_AND_REMEMBER,
                    choice,
                } as Omit<ToolConfirmationResponseEvent, 'id' | 'timestamp' | 'sessionId'>);
                setPendingConfirmation(null);
            }
        },
        [pendingConfirmation, sessionService],
    );

    return {
        events,
        isProcessing,
        pendingConfirmation,
        currentActivity,
        handleConfirmation,
        toolExecutions,
        todoState,
        errorState,
    };
};