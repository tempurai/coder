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

interface ParsedDiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  lineNumber?: string;
}

export const EventItem: React.FC<EventItemProps> = React.memo(({ event, index, detailMode }) => {
  const { currentTheme } = useTheme();

  const parseDiffContent = (content: string): ParsedDiffLine[] => {
    const lines = content.split('\n');
    const parsed: ParsedDiffLine[] = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        parsed.push({ type: 'header', content: line });
      } else if (line.startsWith('+')) {
        parsed.push({ type: 'add', content: line });
      } else if (line.startsWith('-')) {
        parsed.push({ type: 'remove', content: line });
      } else {
        parsed.push({ type: 'context', content: line });
      }
    }

    return parsed;
  };

  const renderDiffContent = (content: string) => {
    const diffLines = parseDiffContent(content);

    return (
      <Box flexDirection='column' marginLeft={2}>
        {diffLines.map((line, idx) => {
          let color = currentTheme.colors.diff.context;
          if (line.type === 'add') color = currentTheme.colors.diff.added;
          else if (line.type === 'remove') color = currentTheme.colors.diff.removed;
          else if (line.type === 'header') color = currentTheme.colors.diff.modified;

          return (
            <Text key={idx} color={color}>
              {line.content}
            </Text>
          );
        })}
      </Box>
    );
  };

  const getEventContent = () => {
    switch (event.type) {
      case UIEventType.UserInput:
        const userEvent = event as any;
        return {
          indicatorType: 'user' as const,
          functionCall: null,
          resultSummary: userEvent.input,
          details: null,
        };

      case UIEventType.TextGenerated:
        const textEvent = event as TextGeneratedEvent;
        return {
          indicatorType: 'system' as const,
          functionCall: null,
          resultSummary: textEvent.text,
          details: null,
        };

      case UIEventType.TaskComplete:
        const taskCompleteEvent = event as TaskCompletedEvent;
        return {
          indicatorType: taskCompleteEvent.success ? ('system' as const) : ('error' as const),
          functionCall: 'TaskComplete()',
          resultSummary: taskCompleteEvent.success ? 'Task completed' : `Task failed: ${taskCompleteEvent.error}`,
          details: taskCompleteEvent.error || null,
        };

      case UIEventType.ThoughtGenerated:
        const thoughtEvent = event as any;
        return {
          indicatorType: 'assistant' as const,
          functionCall: 'Think()',
          resultSummary: `${thoughtEvent.thought.substring(0, 80)}...`,
          details: detailMode ? thoughtEvent.thought : null,
        };

      case UIEventType.ToolExecutionCompleted:
        const toolCompleteEvent = event as any;
        return {
          indicatorType: toolCompleteEvent.success ? ('tool' as const) : ('error' as const),
          functionCall: toolCompleteEvent.displayTitle,
          resultSummary: toolCompleteEvent.displaySummary,
          details: detailMode ? toolCompleteEvent.displayDetails : null,
          isDiff: toolCompleteEvent.toolName === 'apply_patch' && toolCompleteEvent.displayDetails,
        };

      case UIEventType.SystemInfo:
        const sysEvent = event as any;
        return {
          indicatorType: sysEvent.level === 'error' ? ('error' as const) : ('system' as const),
          functionCall: null,
          resultSummary: sysEvent.message,
          details: sysEvent.context ? JSON.stringify(sysEvent.context, null, 2) : null,
        };

      default:
        return {
          indicatorType: 'system' as const,
          functionCall: `${event.type}()`,
          resultSummary: 'Event processed',
          details: JSON.stringify(event, null, 2),
        };
    }
  };

  const { indicatorType, functionCall, resultSummary, details, isDiff } = getEventContent();

  return (
    <Box flexDirection='column'>
      {functionCall && (
        <Box>
          <Box marginRight={1}>
            <StatusIndicator type={indicatorType} />
          </Box>
          <Box flexGrow={1}>
            <Text color={currentTheme.colors.semantic.functionCall} bold>
              {functionCall}
            </Text>
          </Box>
        </Box>
      )}

      <Box marginLeft={functionCall ? 2 : 0}>
        <Text color={currentTheme.colors.semantic.indicator}>⎿ </Text>
        <Text color={currentTheme.colors.semantic.result}>
          {resultSummary}
          {details && <Text color={currentTheme.colors.semantic.metadata}> (ctrl+r to expand)</Text>}
        </Text>
      </Box>

      {details && detailMode && (
        <Box marginLeft={4} marginTop={1}>
          {isDiff ? renderDiffContent(details) : <Text color={currentTheme.colors.text.secondary}>{details}</Text>}
        </Box>
      )}
    </Box>
  );
});
