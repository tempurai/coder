import { useState, useEffect, useCallback } from 'react';
import { SessionService } from '../../services/SessionService.js';
import { UIEvent, UIEventType, ToolConfirmationResponseEvent } from '../../events/index.js';

// 定义确认请求的数据结构
interface PendingConfirmation {
    confirmationId: string;
    toolName: string;
    args: any;
    description: string;
}

/**
 * 自定义 Hook，用于订阅 sessionService 事件并管理相关 UI 状态。
 * 这是处理事件流、处理状态和确认请求的唯一真实来源。
 * @param sessionService SessionService 的实例
 * @returns 包含 UI 状态和事件处理函数的对象
 */
export const useSessionEvents = (sessionService: SessionService) => {
    const [events, setEvents] = useState<UIEvent[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [currentActivity, setCurrentActivity] = useState<string>('');
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

    useEffect(() => {
        const eventEmitter = sessionService.events;
        let eventBuffer: UIEvent[] = [];
        let batchTimeout: NodeJS.Timeout | null = null;

        // 批处理并刷新事件，以避免过于频繁的渲染
        const flushEvents = () => {
            if (eventBuffer.length > 0) {
                setEvents((prev) => [...prev, ...eventBuffer]);
                eventBuffer = [];
            }
            batchTimeout = null;
        };

        const handleEvent = (event: UIEvent) => {
            // 当等待用户确认时，冻结事件流，防止UI刷新
            if (pendingConfirmation) {
                return;
            }

            eventBuffer.push(event);
            if (batchTimeout) {
                clearTimeout(batchTimeout);
            }
            batchTimeout = setTimeout(flushEvents, 16); // 16ms 批处理

            // 根据事件类型更新状态
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
                    });
                    break;
                case UIEventType.ToolConfirmationResponse:
                    setPendingConfirmation(null);
                    break;
            }
        };

        const subscription = eventEmitter.onAll(handleEvent);

        // 清理函数
        return () => {
            subscription.unsubscribe();
            if (batchTimeout) {
                clearTimeout(batchTimeout);
            }
            flushEvents();
        };
    }, [sessionService, pendingConfirmation]); // 依赖 pendingConfirmation 以便在确认后重新开始监听

    // 处理用户确认的回调函数
    const handleConfirmation = useCallback(
        (confirmationId: string, approved: boolean) => {
            if (pendingConfirmation?.confirmationId === confirmationId) {
                sessionService.events.emit({
                    type: 'tool_confirmation_response',
                    confirmationId,
                    approved,
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