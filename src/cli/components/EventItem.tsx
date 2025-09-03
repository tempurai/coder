import React from 'react';
import { Box } from 'ink';
import { UIEvent } from '../../events/index.js';
import { EventRouter } from './events/EventRouter.js';

interface EventItemProps {
  event: UIEvent;
  index: number;
}

export const EventItem: React.FC<EventItemProps> = React.memo(({ event, index }) => {
  return (
    <Box flexDirection='column' marginBottom={0}>
      <EventRouter event={event} index={index} />
    </Box>
  );
});
