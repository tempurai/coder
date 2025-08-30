import React from 'react';
import { Text, Box } from 'ink';
import { SystemInfoItem, ErrorItem } from '../InkUI.js';

interface SystemMessageProps {
  item: SystemInfoItem | ErrorItem;
}

export const SystemMessage: React.FC<SystemMessageProps> = ({ item }) => {
  const isError = item.type === 'error';

  return (
    <Box marginY={1}>
      <Box>
        <Text color={isError ? 'red' : 'yellow'} bold>
          {isError ? '❌ 错误:' : '📢 系统:'}
        </Text>
      </Box>
      <Box marginLeft={2} marginTop={1}>
        <Text color={isError ? 'red' : 'yellow'}>{item.content}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color='gray' dimColor>
          {item.timestamp.toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
};
