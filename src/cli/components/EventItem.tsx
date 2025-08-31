import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent, UIEventType } from '../../events/index.js';
import { useTheme } from '../themes/index.js';
import { StatusIndicator } from './StatusIndicator.js';

interface EventItemProps {
  event: UIEvent;
  index: number;
  detailMode: boolean;
}

export const EventItem: React.FC<EventItemProps> = ({ event, index, detailMode }) => {
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

      case UIEventType.ThoughtGenerated:
        const thoughtEvent = event as any;
        const thoughtContent = detailMode ? thoughtEvent.thought : thoughtEvent.thought.substring(0, 100) + (thoughtEvent.thought.length > 100 ? '...' : '');
        return {
          indicatorType: 'assistant' as const,
          mainContent: `Thinking: ${thoughtContent}`,
          details: detailMode ? null : `Context: ${thoughtEvent.context}`,
          timestamp: event.timestamp,
        };

      case UIEventType.ToolExecutionStarted:
        const toolStartEvent = event as any;
        return {
          indicatorType: 'tool' as const,
          mainContent: `Running ${toolStartEvent.toolName}`,
          details: detailMode ? JSON.stringify(toolStartEvent.args, null, 2) : null,
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
          details: detailMode ? (success ? JSON.stringify(toolCompleteEvent.result, null, 2) : toolCompleteEvent.error) : null,
          timestamp: event.timestamp,
        };

      case UIEventType.SystemInfo:
        const sysEvent = event as any;
        return {
          indicatorType: sysEvent.level === 'error' ? ('error' as const) : ('system' as const),
          mainContent: sysEvent.message,
          details: detailMode && sysEvent.context ? JSON.stringify(sysEvent.context, null, 2) : null,
          timestamp: event.timestamp,
        };

      default:
        return {
          indicatorType: 'system' as const,
          mainContent: `${event.type}`,
          details: null,
          timestamp: event.timestamp,
        };
    }
  };

  const { indicatorType, mainContent, details, timestamp, isActive } = getEventContent();

  return (
    <Box flexDirection='column' marginBottom={1}>
      <Box>
        <Box marginRight={1}>
          <StatusIndicator type={indicatorType} isActive={isActive} />
        </Box>
        <Box marginRight={2}>
          <Text color={currentTheme.colors.text.muted}>[{formatTime(timestamp)}]</Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={currentTheme.colors.text.primary}>{mainContent}</Text>
        </Box>
      </Box>

      {details && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={currentTheme.colors.text.secondary}>{details}</Text>
        </Box>
      )}
    </Box>
  );
};
