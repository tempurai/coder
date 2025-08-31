import React from 'react';
import { Box } from 'ink';
import { UIEvent } from '../../events/index.js';
import { EventItem } from './EventItem.js';

interface EventStreamProps {
  events: UIEvent[];
  detailMode: boolean;
}

export const EventStream: React.FC<EventStreamProps> = React.memo(({ events, detailMode }) => {
  return (
    <Box flexDirection='column' marginY={1}>
      {events.map((event, index) => (
        <EventItem key={event.id} event={event} index={index} detailMode={detailMode} />
      ))}
    </Box>
  );
});
