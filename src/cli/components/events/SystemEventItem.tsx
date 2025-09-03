import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent, TaskCompletedEvent, SystemInfoEvent } from '../../../events/index.js';
import { useTheme } from '../../themes/index.js';
import { StatusIndicator } from '../StatusIndicator.js';
import { EventRouter } from './EventRouter.js';

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
          content: userEvent.input?.trim() || '',
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
          content: sysEvent.message?.trim() || '',
        };
      case 'system_info':
        const systemEvent = event as SystemInfoEvent;
        return {
          indicatorType: systemEvent.level === 'error' ? ('error' as const) : ('system' as const),
          content: systemEvent.message?.trim() || '',
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
          content: deafultEvent.displayTitle?.trim() || event.type,
        };
    }
  };

  const { indicatorType, content } = getEventContent();

  return (
    <Box flexDirection='column'>
      <Box>
        <Box marginRight={1}>
          <StatusIndicator type={indicatorType} />
        </Box>
        <Text color={currentTheme.colors.text.primary} wrap='wrap'>
          {content}
        </Text>
      </Box>

      {/* 显示子事件 */}
      {event.subEvents && event.subEvents.length > 0 && (
        <Box flexDirection='column' marginLeft={2}>
          {event.subEvents.map((subEvent, index) => (
            <Box key={index}>
              <Text color={currentTheme.colors.text.muted}>⎿ </Text>
              <Box flexGrow={1}>
                <EventRouter event={subEvent} index={index} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
