import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';

interface HelpPanelProps {
  onCancel: () => void;
  isFocused: boolean;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({ onCancel, isFocused }) => {
  const { currentTheme } = useTheme();

  useInput(
    (input, key) => {
      if (key.escape || key.return) {
        onCancel();
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection='column' paddingLeft={1} paddingRight={3} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
      <Box flexDirection='column'>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.text.muted}>:{'.             '}</Text> - Select execution mode
        </Text>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.text.muted}>/help{'          '}</Text> - Show available commands
        </Text>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.text.muted}>/theme{'         '}</Text> - Switch theme
        </Text>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.text.muted}>/mode{'          '}</Text> - Show current modes
        </Text>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.text.muted}>Shift+Tab{'      '}</Text> - Cycle edit mode
        </Text>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.text.muted}>Ctrl+C{'.        '}</Text> - Exit application
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.accent}>Enter</Text> or <Text color={currentTheme.colors.accent}>Esc</Text> to close
        </Text>
      </Box>
    </Box>
  );
};
