import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';

interface ConfirmationPanelProps {
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
  onConfirm: (confirmationId: string, approved: boolean) => void;
}

export const ConfirmationPanel: React.FC<ConfirmationPanelProps> = ({ confirmationId, toolName, args, description, onConfirm }) => {
  const { currentTheme } = useTheme();

  useInput((input, key) => {
    if (key.return || input === 'y' || input === 'Y') {
      onConfirm(confirmationId, true);
    } else if (input === 'n' || input === 'N') {
      onConfirm(confirmationId, false);
    }
  });

  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'shell_executor':
      case 'multi_command':
        return '🔧';
      case 'save_memory':
        return '💾';
      default:
        return '❓';
    }
  };

  return (
    <Box flexDirection='column' marginY={1} paddingX={2} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.warning}>
      <Box marginBottom={1}>
        <Text color={currentTheme.colors.warning} bold>
          {getToolIcon(toolName)} Tool Confirmation Required
        </Text>
      </Box>

      <Box flexDirection='column' marginBottom={1}>
        <Text color={currentTheme.colors.text.primary} bold>
          Tool: {toolName}
        </Text>
        <Text color={currentTheme.colors.text.secondary}>{description}</Text>
      </Box>

      {args && Object.keys(args).length > 0 && (
        <Box flexDirection='column' marginBottom={1}>
          <Text color={currentTheme.colors.text.muted}>Parameters:</Text>
          <Box marginLeft={2}>
            <Text color={currentTheme.colors.text.secondary}>{JSON.stringify(args, null, 2)}</Text>
          </Box>
        </Box>
      )}

      <Box>
        <Text color={currentTheme.colors.success}>Y</Text>
        <Text color={currentTheme.colors.text.primary}>es / </Text>
        <Text color={currentTheme.colors.error}>N</Text>
        <Text color={currentTheme.colors.text.primary}>o / </Text>
        <Text color={currentTheme.colors.accent}>Enter</Text>
        <Text color={currentTheme.colors.text.muted}> to confirm</Text>
      </Box>
    </Box>
  );
};
