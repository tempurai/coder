import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';
import { UIEvent, UIEventType } from '../../events/index.js';
import { SessionService } from '../../services/SessionService.js';
import { EventStream } from './EventStream.js';
import { ProgressIndicator } from './ProgressIndicator.js';

interface TaskContainerProps {
  children?: React.ReactNode;
  sessionService: SessionService;
  detailMode: boolean;
}

export const TaskContainer: React.FC<TaskContainerProps> = ({ children, sessionService, detailMode }) => {
  const { currentTheme } = useTheme();
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentActivity, setCurrentActivity] = useState<string>('');

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

    const subscription = eventEmitter.onAll((event: UIEvent) => {
      eventBuffer.push(event);
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }
      batchTimeout = setTimeout(flushEvents, 16);

      if (event.type === UIEventType.TaskStart) {
        setIsProcessing(true);
        setCurrentActivity('Processing...');
      }
      if (event.type === UIEventType.TaskComplete) {
        setIsProcessing(false);
        setCurrentActivity('');
      }
    });

    return () => {
      subscription.unsubscribe();
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }
      flushEvents();
    };
  }, [sessionService]);

  return (
    <Box flexDirection='column'>
      <Box>
        <Text color={currentTheme.colors.ui.highlight}>{'⚡'} </Text>
        <Text color={currentTheme.colors.primary} bold>
          Tempurai Code Assistant
        </Text>
      </Box>

      {isProcessing && (
        <Box marginY={1}>
          <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} />
        </Box>
      )}

      <EventStream events={events} detailMode={detailMode} />

      {children}
    </Box>
  );
};
