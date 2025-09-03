import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';
import { CLIEvent, CLISymbol } from '../hooks/useSessionEvents.js';

interface EventItemProps {
  event: CLIEvent;
  index: number;
}

export const EventItem: React.FC<EventItemProps> = React.memo(({ event }) => {
  const { currentTheme } = useTheme();

  const getSymbolColor = (symbol: CLISymbol) => {
    switch (symbol) {
      case CLISymbol.USER_INPUT:
        return currentTheme.colors.semantic.functionCall;
      case CLISymbol.AI_RESPONSE:
        return currentTheme.colors.info;
      case CLISymbol.TOOL_EXECUTING:
        return currentTheme.colors.warning;
      case CLISymbol.TOOL_SUCCESS:
        return currentTheme.colors.success;
      case CLISymbol.TOOL_FAILED:
      case CLISymbol.SYSTEM_ERROR:
        return currentTheme.colors.error;
      default:
        return currentTheme.colors.text.primary;
    }
  };

  const getContentColor = (symbol: CLISymbol) => {
    switch (symbol) {
      case CLISymbol.TOOL_FAILED:
      case CLISymbol.SYSTEM_ERROR:
        return currentTheme.colors.error;
      default:
        return currentTheme.colors.text.primary;
    }
  };

  return (
    <Box flexDirection='column' marginBottom={0}>
      <Box>
        <Text color={getSymbolColor(event.symbol)}>{event.symbol}</Text>
        <Box marginLeft={1} flexGrow={1} width={process.stdout.columns - 6}>
          <Text color={getContentColor(event.symbol)} wrap='wrap'>
            {event.content}
          </Text>
        </Box>
      </Box>

      {event.subEvent &&
        event.subEvent.map((subItem, index) => (
          <Box key={index}>
            <Text color={currentTheme.colors.text.muted}>{'  '}L</Text>
            <Box marginLeft={1} flexGrow={1} width={process.stdout.columns - 8}>
              <Text color={subItem.type === 'error' ? currentTheme.colors.error : currentTheme.colors.text.secondary} wrap='wrap'>
                {subItem.content}
              </Text>
            </Box>
          </Box>
        ))}
    </Box>
  );
});
