import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent, TaskCompletedEvent } from '../../../events/index.js';
import { useTheme } from '../../themes/index.js';
import { StatusIndicator } from '../StatusIndicator.js';

interface SystemEventItemProps {
  event: UIEvent;
  index: number;
}

export const SystemEventItem: React.FC<SystemEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();

  const getEventContent = () => {
    switch (event.type) {
      case 'user_input':
        const userEvent = event as any;
        return {
          indicatorType: 'user' as const,
          content: `${userEvent.input}`,
        };

      case 'task_completed':
        const taskCompleteEvent = event as TaskCompletedEvent;
        return {
          indicatorType: taskCompleteEvent.success ? ('system' as const) : ('error' as const),
          content: taskCompleteEvent.success ? 'Task completed' : `Task failed: ${taskCompleteEvent.error || 'Unknown error'}`,
        };

      case 'system_info':
        const sysEvent = event as any;
        return {
          indicatorType: sysEvent.level === 'error' ? ('error' as const) : ('system' as const),
          content: sysEvent.message,
        };

      case 'snapshot_created':
        const snapEvent = event as any;
        return {
          indicatorType: 'system' as const,
          content: `Snapshot created: ${snapEvent.snapshotId?.substring(0, 8)}...`,
        };

      default:
        const deafultEvent = event as any;
        return {
          indicatorType: 'system' as const,
          content: deafultEvent.displayTitle ?? event.type,
        };
    }
  };

  const { indicatorType, content } = getEventContent();

  return (
    <Box>
      <Box marginRight={1}>
        <StatusIndicator type={indicatorType} />
      </Box>
      <Text color={currentTheme.colors.text.primary} wrap='wrap'>
        {content}
      </Text>
    </Box>
  );
};
