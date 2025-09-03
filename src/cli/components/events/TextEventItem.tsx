import React from 'react';
import { Box, Text } from 'ink';
import { CLIEvent } from '../../hooks/useSessionEvents.js';
import { useTheme } from '../../themes/index.js';

interface TextEventItemProps {
  event: CLIEvent;
  index: number;
}

export const TextEventItem: React.FC<TextEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();

  return (
    <Box>
      <Text color={currentTheme.colors.info}>●</Text>
      <Box marginLeft={1} flexGrow={1} width={process.stdout.columns - 6}>
        <Text color={currentTheme.colors.text.primary} wrap='wrap'>
          {event.content}
        </Text>
      </Box>
    </Box>
  );
};
