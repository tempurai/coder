import { useState, useEffect, useCallback } from 'react';
import { SessionService } from '../../services/SessionService.js';
import { UIEvent, UIEventType, ToolConfirmationResponseEvent } from '../../events/index.js';

interface PendingConfirmation {
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

interface ToolExecutionState {
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

    // 工具执行状态管理
    const [toolExecutions, setToolExecutions] = useState<Map<string, ToolExecutionState>>(new Map());

    const mergeToolExecutionEvents = useCallback((toolExecutionId: string): UIEvent | null => {
        const state = toolExecutions.get(toolExecutionId);
        if (!state || !state.startEvent) return null;

        // 创建合并后的事件
        const mergedEvent: UIEvent = {
            ...state.startEvent,
            type: state.startEvent.type,
        };

        // 根据状态添加额外信息
        if (state.completedEvent) {
            (mergedEvent as any).completedData = state.completedEvent;
        }

        if (state.outputEvents.length > 0) {
            (mergedEvent as any).outputData = state.outputEvents;
        }

        (mergedEvent as any).executionStatus = state.currentStatus;

        return mergedEvent;
    }, [toolExecutions]);

    useEffect(() => {
        const eventEmitter = sessionService.events;
        let eventBuffer: UIEvent[] = [];
        let batchTimeout: NodeJS.Timeout | null = null;

        const flushEvents = () => {
            if (eventBuffer.length > 0) {
                // 处理工具执行相关事件
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

                // 更新工具执行状态
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
                            // 只有当存在startEvent时才处理completed事件
                            if (existing.startEvent) {
                                existing.completedEvent = event;
                                existing.currentStatus = (event as any).success ? 'completed' : 'failed';
                            } else {
                                // 丢弃无法匹配的completed事件
                                return;
                            }
                        }

                        newMap.set(toolExecutionId, existing);
                    });

                    return newMap;
                });

                // 更新显示事件列表
                setEvents((prevEvents) => {
                    const newEvents = [...prevEvents];

                    // 添加非工具执行事件
                    otherEvents.forEach(event => {
                        newEvents.push(event);
                    });

                    // 添加或更新工具执行事件
                    toolEvents.forEach(event => {
                        const toolExecutionId = (event as any).toolExecutionId;
                        if (!toolExecutionId) return;

                        if (event.type === UIEventType.ToolExecutionStarted) {
                            // 添加新的工具执行事件
                            newEvents.push(event);
                        } else if (event.type === UIEventType.ToolExecutionCompleted) {
                            // 查找并更新对应的started事件
                            const existingIndex = newEvents.findIndex(e =>
                                (e as any).toolExecutionId === toolExecutionId &&
                                e.type === UIEventType.ToolExecutionStarted
                            );

                            if (existingIndex !== -1) {
                                // 更新现有事件，添加完成状态
                                const updatedEvent = {
                                    ...newEvents[existingIndex],
                                    completedData: event,
                                    executionStatus: (event as any).success ? 'completed' : 'failed'
                                };
                                newEvents[existingIndex] = updatedEvent as UIEvent;
                            }
                        }
                        // ToolExecutionOutput 事件不直接添加到显示列表中
                    });

                    return newEvents;
                });

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
    }, [sessionService, pendingConfirmation, mergeToolExecutionEvents]);

    const handleConfirmation = useCallback(
        (confirmationId: string, choice: 'yes' | 'no' | 'yes_and_remember') => {
            if (pendingConfirmation?.confirmationId === confirmationId) {
                sessionService.events.emit({
                    type: 'tool_confirmation_response',
                    confirmationId,
                    approved: choice === 'yes' || choice === 'yes_and_remember',
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