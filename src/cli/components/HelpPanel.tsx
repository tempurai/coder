import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';

interface HelpPanelProps {
  onCancel: () => void;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({ onCancel }) => {
  const { currentTheme } = useTheme();

  useInput((input, key) => {
    if (key.escape || key.return) {
      onCancel();
    }
  });

  return (
    <Box flexDirection='column' paddingX={1} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
      <Box marginBottom={1}>
        <Text color={currentTheme.colors.primary} bold>
          Tempurai Code Assistant Help
        </Text>
      </Box>

      <Box flexDirection='column' marginBottom={1}>
        <Text color={currentTheme.colors.text.primary}>
          <Text color={currentTheme.colors.accent}>:</Text> - Select execution mode
        </Text>
        <Text color={currentTheme.colors.text.primary}>
          <Text color={currentTheme.colors.accent}>/help</Text> - Show available commands
        </Text>
        <Text color={currentTheme.colors.text.primary}>
          <Text color={currentTheme.colors.accent}>/theme</Text> - Switch theme
        </Text>
        <Text color={currentTheme.colors.text.primary}>
          <Text color={currentTheme.colors.accent}>/mode</Text> - Show current modes
        </Text>
        <Text color={currentTheme.colors.text.primary}>
          <Text color={currentTheme.colors.accent}>Shift+Tab</Text> - Cycle edit mode
        </Text>
        <Text color={currentTheme.colors.text.primary}>
          <Text color={currentTheme.colors.accent}>Ctrl+C</Text> - Exit application
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={currentTheme.colors.text.secondary}>Tempurai Code is an AI programming assistant that helps with development tasks. Type your request and the AI will analyze, plan, and execute the necessary changes.</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.accent}>Enter</Text> or <Text color={currentTheme.colors.accent}>Esc</Text> to close
        </Text>
      </Box>
    </Box>
  );
};
