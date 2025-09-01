import React from 'react';
import { Box } from 'ink';
import { UIEvent } from '../../events/index.js';
import { EventRouter } from './events/EventRouter.js';

interface EventItemProps {
  event: UIEvent;
  index: number;
  detailMode?: boolean; // 保留接口兼容性，但不使用
}

export const EventItem: React.FC<EventItemProps> = React.memo(({ event, index }) => {
  return (
    <Box flexDirection='column' marginBottom={0}>
      <EventRouter event={event} index={index} />
    </Box>
  );
});
