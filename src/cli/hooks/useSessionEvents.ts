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

export const useSessionEvents = (sessionService: SessionService) => {
    const [events, setEvents] = useState<UIEvent[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [currentActivity, setCurrentActivity] = useState<string>('');
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

    useEffect(() => {
        const eventEmitter = sessionService.events;
        let eventBuffer: UIEvent[] = [];
        let batchTimeout: NodeJS.Timeout | null = null;

        const flushEvents = () => {
            if (eventBuffer.length > 0) {
                setEvents((prev) => [...prev, ...eventBuffer]);
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
    }, [sessionService, pendingConfirmation]);

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
    };
};