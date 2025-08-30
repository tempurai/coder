import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent } from '../../events/index.js';
import { useTheme } from '../themes/index.js';

interface EventItemProps {
  event: UIEvent;
  index: number;
  children: React.ReactNode;
}

export const EventItem: React.FC<EventItemProps> = ({ event, index, children }) => {
  const { currentTheme } = useTheme();
  
  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Timestamp and event index */}
      <Box marginBottom={1}>
        <Text color="dim">
          [{formatTime(event.timestamp)}] #{index + 1}
        </Text>
      </Box>
      
      {/* Event content */}
      <Box>
        {children}
      </Box>
    </Box>
  );
};