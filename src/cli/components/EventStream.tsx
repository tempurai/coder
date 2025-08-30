import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent, UIEventType } from '../../events/index.js';
import { ThoughtSection } from './ThoughtSection.js';
import { PlanSection } from './PlanSection.js';
import { ActionSection } from './ActionSection.js';
import { EventItem } from './EventItem.js';

interface EventStreamProps {
  events: UIEvent[];
}

export const EventStream: React.FC<EventStreamProps> = ({ events }) => {
  return (
    <Box flexDirection='column' marginY={1}>
      {events.map((event, index) => {
        switch (event.type) {
          case UIEventType.ReActIteration:
            return (
              <EventItem key={event.id} event={event} index={index}>
                <Text>
                  🔄 Iteration {(event as any).iteration}/{(event as any).maxIterations}
                </Text>
              </EventItem>
            );

          case UIEventType.ThoughtGenerated:
            return (
              <EventItem key={event.id} event={event} index={index}>
                <ThoughtSection thought={(event as any).thought} iteration={(event as any).iteration} />
              </EventItem>
            );

          case UIEventType.PlanUpdated:
            return (
              <EventItem key={event.id} event={event} index={index}>
                <PlanSection plan={(event as any).plan} iteration={(event as any).iteration} />
              </EventItem>
            );

          case UIEventType.ActionSelected:
          case UIEventType.ToolCallStarted:
            return (
              <EventItem key={event.id} event={event} index={index}>
                <ActionSection
                  action={{
                    tool: (event as any).toolName || (event as any).tool,
                    args: (event as any).args,
                  }}
                  iteration={(event as any).iteration}
                />
              </EventItem>
            );

          case UIEventType.ToolCallCompleted:
            return (
              <EventItem key={event.id} event={event} index={index}>
                <ActionSection
                  action={{
                    tool: (event as any).toolName,
                    args: {},
                    result: (event as any).result,
                    error: (event as any).error,
                  }}
                  iteration={(event as any).iteration}
                />
              </EventItem>
            );

          case UIEventType.ObservationMade:
            return (
              <EventItem key={event.id} event={event} index={index}>
                <Box marginLeft={2} paddingX={1} borderStyle='single' borderColor='blue'>
                  <Box flexDirection='column'>
                    <Box marginBottom={1}>
                      <Text color='blue' bold>
                        👁️ Observation
                      </Text>
                    </Box>
                    <Text>{(event as any).observation}</Text>
                    {(event as any).analysis && (
                      <Box marginTop={1}>
                        <Text color='dim'>Analysis: {(event as any).analysis}</Text>
                      </Box>
                    )}
                  </Box>
                </Box>
              </EventItem>
            );

          case UIEventType.SystemInfo:
            return (
              <EventItem key={event.id} event={event} index={index}>
                <Box marginLeft={2}>
                  <Text color={(event as any).level === 'error' ? 'red' : 'yellow'}>
                    {(event as any).level === 'error' ? '❌' : 'ℹ️'} {(event as any).message}
                  </Text>
                </Box>
              </EventItem>
            );

          default:
            return null;
        }
      })}
    </Box>
  );
};
