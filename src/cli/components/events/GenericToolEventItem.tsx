import React from 'react';
import { Box, Text } from 'ink';
import { CLIEvent, CLISymbol } from '../../hooks/useSessionEvents.js';
import { useTheme } from '../../themes/index.js';

interface GenericToolEventItemProps {
  event: CLIEvent;
  index: number;
}

export const GenericToolEventItem: React.FC<GenericToolEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();

  const getSymbolColor = () => {
    switch (event.symbol) {
      case CLISymbol.TOOL_EXECUTING:
        return currentTheme.colors.warning;
      case CLISymbol.TOOL_SUCCESS:
        return currentTheme.colors.success;
      case CLISymbol.TOOL_FAILED:
        return currentTheme.colors.error;
      default:
        return currentTheme.colors.text.primary;
    }
  };

  return (
    <Box flexDirection='column'>
      <Box>
        <Text color={getSymbolColor()} bold>
          {event.symbol} {event.content}
        </Text>
      </Box>

      {event.subEvent && (
        <Box marginLeft={2}>
          <Text color={currentTheme.colors.text.muted}>{'  '}L </Text>
          <Box flexGrow={1}>
            {event.subEvent.map((subItem, index) => (
              <Text key={index} color={subItem.type === 'error' ? currentTheme.colors.error : currentTheme.colors.text.secondary} wrap='wrap'>
                {subItem.content}
              </Text>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
