import React from 'react';
import { CLIEvent, CLIEventType, CLISymbol } from './useSessionEvents.js';

interface EventSeparation {
    staticEvents: CLIEvent[];
    dynamicEvents: CLIEvent[];
}

export const useEventSeparation = (events: CLIEvent[]): EventSeparation => {
    return React.useMemo(() => {
        const dynamic: CLIEvent[] = [];
        const static_events: CLIEvent[] = [];

        events.forEach((event) => {
            // 将正在执行的工具事件放到动态区域
            if (event.type === CLIEventType.TOOL_EXECUTION && event.symbol === CLISymbol.TOOL_EXECUTING) {
                dynamic.push(event);
            } else {
                static_events.push(event);
            }
        });

        return {
            staticEvents: static_events,
            dynamicEvents: dynamic,
        };
    }, [events]);
};