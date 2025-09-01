import React from 'react';
import { UIEvent, UIEventType } from '../../events/index.js';

interface EventSeparation {
    staticEvents: UIEvent[];
    dynamicEvents: UIEvent[];
}

export const useEventSeparation = (events: UIEvent[]): EventSeparation => {
    return React.useMemo(() => {
        const dynamic: UIEvent[] = [];
        const static_events: UIEvent[] = [];

        events.forEach((event) => {
            if (event.type === UIEventType.ToolExecutionStarted) {
                const toolEvent = event as any;
                const executionStatus = toolEvent.executionStatus || 'started';
                if (executionStatus === 'started' || executionStatus === 'executing') {
                    dynamic.push(event);
                } else {
                    static_events.push(event);
                }
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