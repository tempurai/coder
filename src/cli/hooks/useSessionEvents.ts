import { useState, useEffect, useCallback } from 'react';
import { SessionService } from '../../services/SessionService.js';
import { UIEvent, UIEventType, ToolConfirmationResponseEvent, SystemInfoEvent } from '../../events/index.js';
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

export const useSessionEvents = (sessionService: SessionService) => {
    const [events, setEvents] = useState<UIEvent[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [currentActivity, setCurrentActivity] = useState<string>('');
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
    const [toolExecutions, setToolExecutions] = useState<Map<string, ToolExecutionState>>(new Map());

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

    const handleSystemInfoError = useCallback((errorEvent: SystemInfoEvent) => {
        switch (errorEvent.source) {
            case 'tool':
                if (errorEvent.sourceId) {
                    setEvents(prevEvents => prevEvents.map(event => {
                        if ((event as any).toolExecutionId === errorEvent.sourceId) {
                            return {
                                ...event,
                                subEvents: [...(event.subEvents || []), errorEvent]
                            };
                        }
                        return event;
                    }));
                }
                break;
            case 'agent':
                const recentUserInput = [...events].reverse().find(e => e.type === 'user_input');
                if (recentUserInput?.id) {
                    setEvents(prevEvents => prevEvents.map(event => {
                        if (event.id === recentUserInput.id) {
                            return {
                                ...event,
                                subEvents: [...(event.subEvents || []), errorEvent]
                            };
                        }
                        return event;
                    }));
                } else {
                    setEvents(prevEvents => [...prevEvents, errorEvent as UIEvent]);
                }
                break;
            case 'system':
            default:
                setEvents(prevEvents => [...prevEvents, errorEvent as UIEvent]);
                break;
        }
    }, [events]);

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
                eventBuffer = [];
            }
        };

        const handleEvent = (event: UIEvent) => {
            // 处理系统信息错误事件
            if (event.type === 'system_info') {
                const sysEvent = event as SystemInfoEvent;
                if (sysEvent.level === 'error') {
                    handleSystemInfoError(sysEvent);
                    return;
                }
            }

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
                    break;
                case UIEventType.TaskComplete:
                    setTimeout(() => {
                        setIsProcessing(false);
                        setCurrentActivity('');
                    }, 500);
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
    }, [sessionService, pendingConfirmation, mergeToolExecutionEvents, handleSystemInfoError]);

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
    };
};