import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';
import { UIEvent, UIEventType, ToolConfirmationRequestEvent, ToolConfirmationResponseEvent } from '../../events/index.js';
import { SessionService } from '../../services/SessionService.js';
import { EventStream } from './EventStream.js';
import { ProgressIndicator } from './ProgressIndicator.js';

interface PendingConfirmation {
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
}

interface TaskContainerProps {
  children?: React.ReactNode;
  sessionService: SessionService;
  detailMode: boolean;
  onConfirm: (confirmationId: string, approved: boolean) => void;
}

export const TaskContainer: React.FC<TaskContainerProps> = ({ children, sessionService, detailMode, onConfirm }) => {
  const { currentTheme } = useTheme();
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentActivity, setCurrentActivity] = useState<string>('');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const generateId = useCallback((): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Handle confirmation
  const handleConfirmation = useCallback(
    (confirmationId: string, approved: boolean) => {
      // Only update local state, don't emit events here
      // Events should be emitted by the component that receives user input
      if (pendingConfirmation?.confirmationId === confirmationId) {
        setPendingConfirmation(null);
      }
      // Call the parent callback
      onConfirm(confirmationId, approved);
    },
    [pendingConfirmation, onConfirm],
  );

  // Event subscription and processing
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
      // Buffer events for batch processing
      eventBuffer.push(event);

      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }
      batchTimeout = setTimeout(flushEvents, 16); // 16ms batching

      // Handle processing state changes
      if (event.type === UIEventType.TaskStart) {
        setIsProcessing(true);
        setCurrentActivity('Processing...');
      }

      if (event.type === UIEventType.TaskComplete) {
        setIsProcessing(false);
        setCurrentActivity('');
      }

      // Handle confirmation events
      if (event.type === 'tool_confirmation_request') {
        const confirmEvent = event as ToolConfirmationRequestEvent;
        setPendingConfirmation({
          confirmationId: confirmEvent.confirmationId,
          toolName: confirmEvent.toolName,
          args: confirmEvent.args,
          description: confirmEvent.description,
        });
      }

      if (event.type === 'tool_confirmation_response') {
        const responseEvent = event as ToolConfirmationResponseEvent;
        if (pendingConfirmation?.confirmationId === responseEvent.confirmationId) {
          setPendingConfirmation(null);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }
      flushEvents(); // Flush any remaining events
    };
  }, [sessionService, pendingConfirmation]);

  return (
    <Box flexDirection='column'>
      {/* Header */}
      <Box>
        <Text color={currentTheme.colors.ui.highlight}>{'⚡'} </Text>
        <Text color={currentTheme.colors.primary} bold>
          Tempurai Code Assistant
        </Text>
      </Box>

      {/* Processing Indicator */}
      {isProcessing && (
        <Box marginY={1}>
          <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} />
        </Box>
      )}

      {/* Event Stream */}
      <EventStream events={events} detailMode={detailMode} />

      {/* Children (additional content) */}
      {children}
    </Box>
  );
};
