import React from 'react';
import { Text, Box } from 'ink';
import { AssistantMessageItem } from '../InkUI.js';

interface AssistantMessageProps {
  item: AssistantMessageItem;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({ item }) => {
  return (
    <Box marginY={1}>
      <Box>
        <Text color='blue' bold>
          🤖 Assistant:
        </Text>
      </Box>
      <Box marginLeft={2} marginTop={1}>
        <Text color='white'>{item.content}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color='gray' dimColor>
          {item.timestamp.toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
};
