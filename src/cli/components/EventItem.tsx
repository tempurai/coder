import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent, UIEventType, TextGeneratedEvent, TaskCompletedEvent } from '../../events/index.js';
import { useTheme } from '../themes/index.js';
import { StatusIndicator } from './StatusIndicator.js';

interface EventItemProps {
  event: UIEvent;
  index: number;
  detailMode: boolean;
}

export const EventItem: React.FC<EventItemProps> = React.memo(({ event, index, detailMode }) => {
  const { currentTheme } = useTheme();

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getEventContent = () => {
    switch (event.type) {
      case UIEventType.UserInput:
        const userEvent = event as any;
        return {
          indicatorType: 'user' as const,
          mainContent: userEvent.input,
          details: null,
          timestamp: event.timestamp,
        };

      case UIEventType.TextGenerated:
        const textEvent = event as TextGeneratedEvent;
        return {
          indicatorType: 'system' as const,
          mainContent: textEvent.text,
          details: null,
          timestamp: event.timestamp,
        };

      case UIEventType.TaskComplete:
        const taskCompleteEvent = event as TaskCompletedEvent;
        const summaryPrefix = taskCompleteEvent.success ? 'Task Completed' : 'Task Failed';
        return {
          indicatorType: taskCompleteEvent.success ? ('system' as const) : ('error' as const),
          mainContent: `${summaryPrefix}\n${taskCompleteEvent.summary}`,
          details: taskCompleteEvent.error ? `Error: ${taskCompleteEvent.error}` : null,
          timestamp: event.timestamp,
        };

      case UIEventType.ThoughtGenerated:
        const thoughtEvent = event as any;
        const thoughtContent = detailMode ? thoughtEvent.thought : `${thoughtEvent.thought.substring(0, 100)}...`;
        return {
          indicatorType: 'assistant' as const,
          mainContent: `Thinking: ${thoughtContent}`,
          details: `${thoughtEvent.context}`,
          timestamp: event.timestamp,
        };

      case UIEventType.ToolExecutionStarted:
        const toolStartEvent = event as any;
        return {
          indicatorType: 'tool' as const,
          mainContent: `Running ${toolStartEvent.toolName}`,
          details: JSON.stringify(toolStartEvent.args, null, 2),
          timestamp: event.timestamp,
          isActive: true,
        };

      case UIEventType.ToolExecutionCompleted:
        const toolCompleteEvent = event as any;
        const success = toolCompleteEvent.success;
        const resultText = success ? 'completed' : 'failed';
        const mainText = `Tool ${toolCompleteEvent.toolName} ${resultText}`;
        return {
          indicatorType: success ? ('tool' as const) : ('error' as const),
          mainContent: mainText,
          details: success ? JSON.stringify(toolCompleteEvent.result, null, 2) : toolCompleteEvent.error,
          timestamp: event.timestamp,
        };

      case UIEventType.SystemInfo:
        const sysEvent = event as any;
        return {
          indicatorType: sysEvent.level === 'error' ? ('error' as const) : ('system' as const),
          mainContent: sysEvent.message,
          details: JSON.stringify(sysEvent.context, null, 2),
          timestamp: event.timestamp,
        };

      default:
        return {
          indicatorType: 'system' as const,
          mainContent: `Event: ${event.type}`,
          details: JSON.stringify(event, null, 2),
          timestamp: event.timestamp,
        };
    }
  };

  const { indicatorType, mainContent, details, timestamp, isActive } = getEventContent();

  return (
    <Box flexDirection='column'>
      <Box>
        <Text color={currentTheme.colors.text.muted}>[{formatTime(timestamp)}]</Text>
      </Box>
      <Box>
        <Box marginRight={1}>
          <StatusIndicator type={indicatorType} isActive={isActive} />
        </Box>
        <Box flexGrow={1} flexDirection='column'>
          <Text color={currentTheme.colors.text.primary}>{mainContent}</Text>
        </Box>
      </Box>
      {details && (
        <Box marginTop={0}>
          <Text color={currentTheme.colors.text.secondary}>{details}</Text>
        </Box>
      )}
    </Box>
  );
});
