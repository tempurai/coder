import React from 'react';
import { Text, Box } from 'ink';
import { UserMessageItem } from '../InkUI';

interface UserMessageProps {
  item: UserMessageItem;
}

export const UserMessage: React.FC<UserMessageProps> = ({ item }) => {
  return (
    <Box marginY={1}>
      <Box>
        <Text color="green" bold>
          💬 You:
        </Text>
      </Box>
      <Box marginLeft={2} marginTop={1}>
        <Text color="white">{item.content}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {item.timestamp.toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
};