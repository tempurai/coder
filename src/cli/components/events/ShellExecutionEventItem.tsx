import React from 'react';
import { Box, Text } from 'ink';
import { CLIEvent, CLISymbol } from '../../hooks/useSessionEvents.js';
import { useTheme } from '../../themes/index.js';

interface ShellExecutionEventItemProps {
  event: CLIEvent;
  index: number;
}

export const ShellExecutionEventItem: React.FC<ShellExecutionEventItemProps> = ({ event }) => {
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
            {event.subEvent.map((subItem, index) => {
              let content = subItem.content;
              const lines = content.split('\n');
              const maxLines = subItem.type === 'error' ? 20 : 7;

              if (lines.length > maxLines) {
                content = lines.slice(0, maxLines).join('\n') + `\n(...${lines.length - maxLines} more lines)`;
              }

              return (
                <Text key={index} color={subItem.type === 'error' ? currentTheme.colors.error : currentTheme.colors.text.secondary} wrap='wrap'>
                  {content}
                </Text>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
};
