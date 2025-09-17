import { useState, useEffect, useCallback } from 'react';
import { SessionService } from '../../services/SessionService.js';
import { UIEvent, UIEventType, ToolConfirmationResponseEvent, SystemInfoEvent, TodoStartEvent, TodoEndEvent } from '../../events/index.js';
import { ConfirmationChoice } from '../../services/HITLManager.js';
import { useUiStore } from '../stores/uiStore.js';

export interface PendingConfirmation {
    confirmationId: string;
    toolName: string;
    args: any;
    description: string;
    options?: {
        showRememberOption?: boolean;
        defaultChoice?: 'yes' | 'no' | 'yes_and_remember';
        timeout?: number;
        isEditOperation?: boolean;
    };
}

export interface ToolExecutionState {
    startEvent?: UIEvent;
    outputEvents: UIEvent[];
    completedEvent?: UIEvent;
    currentStatus: 'started' | 'executing' | 'completed' | 'failed';
}

export const enum CLISymbol {
    USER_INPUT = '>',
    AI_RESPONSE = '✦',
    TOOL_EXECUTING = '~',
    TOOL_SUCCESS = '✓',
    TOOL_FAILED = '✗',
    SYSTEM_ERROR = '!',
    WAITING_INPUT = '●',
    USER_INTERRUPT = '␛'
}

export const enum CLIEventType {
    USER_INPUT = 'user_input',
    AI_RESPONSE = 'ai_response',
    TOOL_EXECUTION = 'tool_execution',
    SYSTEM_INFO = 'system_info'
}

export interface CLISubEvent {
    type: 'error' | 'info' | 'output';
    content: string;
    source?: string;
    sourceId?: string;
}

export interface CLIEvent {
    id: string;
    type: CLIEventType;
    symbol: CLISymbol;
    content: string;
    subEvent?: CLISubEvent[];
    timestamp: Date;
    originalEvent?: UIEvent;
}

function getTaskCompleteDisplay(terminateReason: string, error?: string): { symbol: CLISymbol, content: string } {
    switch (terminateReason) {
        case 'FINISHED':
            return {
                symbol: CLISymbol.AI_RESPONSE,
                content: 'Task completed'
            };
        case 'WAITING_FOR_USER':
            return {
                symbol: CLISymbol.WAITING_INPUT,
                content: 'Waiting for your input to continue'
            };
        case 'INTERRUPTED':
            return {
                symbol: CLISymbol.USER_INTERRUPT,
                content: 'Task interrupted by user'
            };
        case 'TIMEOUT':
            return {
                symbol: CLISymbol.SYSTEM_ERROR,
                content: 'Task timed out after maximum iterations'
            };
        case 'ERROR':
            return {
                symbol: CLISymbol.SYSTEM_ERROR,
                content: `Task failed: ${error || 'Unknown error'}`
            };
        default:
            return {
                symbol: CLISymbol.SYSTEM_ERROR,
                content: `Task ended with status: ${terminateReason}`
            };
    }
}

export const useSessionEvents = (sessionService: SessionService) => {
    const [events, setEvents] = useState<UIEvent[]>([]);
    const [cliEvents, setCLIEvents] = useState<CLIEvent[]>([]);
    const [nonToolEvents, setNonToolEvents] = useState<UIEvent[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [currentActivity, setCurrentActivity] = useState<string>('');
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
    const [toolExecutions, setToolExecutions] = useState<Map<string, ToolExecutionState>>(new Map());
    const { setActivePanel } = useUiStore((state) => state.actions);

    const convertToCLIEvent = useCallback((uiEvent: UIEvent): CLIEvent | null => {
        const baseEvent = {
            id: uiEvent.id || `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: uiEvent.timestamp || new Date(),
            originalEvent: uiEvent
        };
        const subEvent: CLISubEvent[] = [];
        switch (uiEvent.type) {
            case UIEventType.UserInput:
                const userEvent = uiEvent as any;
                if (userEvent.error) {
                    subEvent.push({
                        type: 'error',
                        content: userEvent.error
                    });
                }
                return {
                    ...baseEvent,
                    type: CLIEventType.USER_INPUT,
                    symbol: CLISymbol.USER_INPUT,
                    content: userEvent.input?.trim() || '',
                    subEvent: subEvent.length > 0 ? subEvent : undefined
                };
            case UIEventType.TextGenerated:
            case UIEventType.ThoughtGenerated:
                const textEvent = uiEvent as any;
                const text = textEvent.text || textEvent.thought || '';
                return {
                    ...baseEvent,
                    type: CLIEventType.AI_RESPONSE,
                    symbol: CLISymbol.AI_RESPONSE,
                    content: text.trim()
                };
            case UIEventType.TodoStart:
                const todoStartEvent = uiEvent as TodoStartEvent;
                return {
                    ...baseEvent,
                    type: CLIEventType.SYSTEM_INFO,
                    symbol: CLISymbol.AI_RESPONSE,
                    content: `Started: ${todoStartEvent.title}`
                };
            case UIEventType.TodoEnd:
                const todoEndEvent = uiEvent as TodoEndEvent;
                return null

            case UIEventType.ToolExecutionStarted:
                const toolStartEvent = uiEvent as any;
                const executionStatus = toolStartEvent.executionStatus || 'started';
                const isCompleted = executionStatus === 'completed' || executionStatus === 'failed';
                const isError = executionStatus === 'failed';

                let symbol: CLISymbol = CLISymbol.TOOL_EXECUTING;
                if (isCompleted) {
                    symbol = isError ? CLISymbol.TOOL_FAILED : CLISymbol.TOOL_SUCCESS;
                }

                const displayTitle = toolStartEvent.displayTitle || `${toolStartEvent.toolName}()`;

                if (toolStartEvent.completedData?.displayDetails) {
                    subEvent.push({
                        type: isError ? 'error' : 'output',
                        content: toolStartEvent.completedData.displayDetails
                    });
                }

                if (toolStartEvent.outputData && toolStartEvent.outputData.length > 0) {
                    toolStartEvent.outputData.forEach((output: any) => {
                        if (output.content && !output.content.startsWith('Executing:')) {
                            subEvent.push({
                                type: 'output',
                                content: output.content
                            });
                        }
                    });
                }

                if (toolStartEvent.completedData?.error) {
                    subEvent.push({
                        type: 'error',
                        content: toolStartEvent.completedData.error
                    });
                }

                return {
                    ...baseEvent,
                    type: CLIEventType.TOOL_EXECUTION,
                    symbol,
                    content: displayTitle,
                    subEvent: subEvent.length > 0 ? subEvent : undefined
                };

            case UIEventType.TaskComplete:
                const taskCompleteEvent = uiEvent as any;
                if (taskCompleteEvent.terminateReason == "FINISHED") {
                    return null
                }
                return {
                    ...baseEvent,
                    type: CLIEventType.SYSTEM_INFO,
                    ...getTaskCompleteDisplay(taskCompleteEvent.terminateReason, taskCompleteEvent.error),
                };
            case UIEventType.SystemInfo:
                const sysEvent = uiEvent as SystemInfoEvent;
                const subEventForSysInfo: CLISubEvent[] = [];
                if (sysEvent.source && sysEvent.sourceId) {
                    subEventForSysInfo.push({
                        type: sysEvent.level === 'error' ? 'error' : 'info',
                        content: sysEvent.message?.trim() || '',
                        source: sysEvent.source,
                        sourceId: sysEvent.sourceId
                    });
                }
                return {
                    ...baseEvent,
                    type: CLIEventType.SYSTEM_INFO,
                    symbol: sysEvent.level === 'error' ? CLISymbol.SYSTEM_ERROR : CLISymbol.AI_RESPONSE,
                    content: sysEvent.message?.trim() || '',
                    subEvent: subEventForSysInfo.length > 0 ? subEventForSysInfo : undefined
                };
            case UIEventType.SnapshotCreated:
                const snapEvent = uiEvent as any;
                return {
                    ...baseEvent,
                    type: CLIEventType.SYSTEM_INFO,
                    symbol: CLISymbol.AI_RESPONSE,
                    content: `Snapshot created: ${snapEvent.snapshotId?.substring(0, 8)}...`
                };
            case UIEventType.ToolConfirmationRequest:
            case UIEventType.ToolConfirmationResponse:
                return null;
            case UIEventType.TaskStart:
                return null;
            default:
                const defaultEvent = uiEvent as any;
                return {
                    ...baseEvent,
                    type: CLIEventType.SYSTEM_INFO,
                    symbol: CLISymbol.AI_RESPONSE,
                    content: defaultEvent.displayTitle?.trim() || uiEvent.type
                };
        }
    }, []);

    useEffect(() => {
        const eventEmitter = sessionService.events;
        let eventBuffer: UIEvent[] = [];
        let batchTimeout: NodeJS.Timeout | null = null;

        const flushEvents = () => {
            if (eventBuffer.length > 0) {
                const currentToolEvents = eventBuffer.filter(event =>
                    event.type === UIEventType.ToolExecutionStarted ||
                    event.type === UIEventType.ToolExecutionOutput ||
                    event.type === UIEventType.ToolExecutionCompleted
                );
                const currentNonToolEvents = eventBuffer.filter(event =>
                    event.type !== UIEventType.ToolExecutionStarted &&
                    event.type !== UIEventType.ToolExecutionOutput &&
                    event.type !== UIEventType.ToolExecutionCompleted
                );

                setToolExecutions(prev => {
                    const newMap = new Map(prev);
                    currentToolEvents.forEach(event => {
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
                            existing.completedEvent = event;
                            existing.currentStatus = (event as any).success ? 'completed' : 'failed';
                        }
                        newMap.set(toolExecutionId, existing);
                    });
                    return newMap;
                });

                if (currentNonToolEvents.length > 0) {
                    setNonToolEvents(prev => [...prev, ...currentNonToolEvents]);
                }

                eventBuffer = [];
            }
        };

        const handleEvent = (event: UIEvent) => {
            if (pendingConfirmation) {
                return;
            }
            eventBuffer.push(event);
            if (batchTimeout) {
                clearTimeout(batchTimeout);
            }
            // 增加批处理间隔从16ms到100ms，减少频繁渲染
            batchTimeout = setTimeout(flushEvents, 100);
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
                    setActivePanel('CONFIRMATION');
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
    }, [sessionService, pendingConfirmation, setActivePanel]);

    useEffect(() => {
        const mergedToolEvents = Array.from(toolExecutions.values())
            .map(state => {
                if (!state.startEvent) return null;
                const mergedEvent: any = { ...state.startEvent };
                if (state.completedEvent) {
                    mergedEvent.completedData = state.completedEvent;
                    mergedEvent.executionStatus = (state.completedEvent as any).success ? 'completed' : 'failed';
                } else {
                    mergedEvent.executionStatus = state.currentStatus;
                }
                if (state.outputEvents.length > 0) {
                    mergedEvent.outputData = state.outputEvents;
                }
                return mergedEvent as UIEvent;
            })
            .filter((e): e is UIEvent => e !== null);

        const allEvents = [...nonToolEvents, ...mergedToolEvents];

        allEvents.sort((a, b) => {
            const tsA = a.timestamp || new Date(0);
            const tsB = b.timestamp || new Date(0);
            return tsA.getTime() - tsB.getTime();
        });

        setEvents(allEvents);
    }, [nonToolEvents, toolExecutions]);

    useEffect(() => {
        const convertedEvents = events
            .map(convertToCLIEvent)
            .filter((event): event is CLIEvent => event !== null);
        setCLIEvents(convertedEvents);
    }, [events, convertToCLIEvent]);

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
        cliEvents,
        isProcessing,
        pendingConfirmation,
        currentActivity,
        handleConfirmation,
        toolExecutions,
    };
};