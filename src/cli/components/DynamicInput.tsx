import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../themes/index.js';

interface ConfirmationData {
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
}

interface DynamicInputProps {
  onSubmit: (value: string) => void;
  placeholder: string;
  isProcessing: boolean;
  confirmationData?: ConfirmationData | null;
  onConfirm?: (confirmationId: string, approved: boolean) => void;
}

type ConfirmationChoice = 'yes' | 'no';

export const DynamicInput: React.FC<DynamicInputProps> = ({ onSubmit, placeholder, isProcessing, confirmationData, onConfirm }) => {
  const { currentTheme } = useTheme();

  const [input, setInput] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<ConfirmationChoice>('yes');

  const isConfirmationMode = !!confirmationData;

  const handleInternalSubmit = useCallback(() => {
    if (input.trim()) {
      onSubmit(input);
      setInput(''); // Clear input after submission
    }
  }, [input, onSubmit]);

  useInput(
    (char, key) => {
      if (key.leftArrow) setSelectedChoice('yes');
      else if (key.rightArrow) setSelectedChoice('no');
      else if (key.return) {
        if (confirmationData && onConfirm) {
          onConfirm(confirmationData.confirmationId, selectedChoice === 'yes');
        }
      } else if (key.escape) {
        if (confirmationData && onConfirm) {
          onConfirm(confirmationData.confirmationId, false);
        }
      } else if (char.toLowerCase() === 'y') {
        if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, true);
      } else if (char.toLowerCase() === 'n') {
        if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, false);
      }
    },
    { isActive: isConfirmationMode },
  );

  if (isConfirmationMode && confirmationData) {
    // Confirmation mode UI remains the same
    return (
      <Box flexDirection='column'>
        <Box flexDirection='column' marginY={1} paddingX={2} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.warning}>
          <Box marginBottom={1}>
            <Text color={currentTheme.colors.warning} bold>
              Tool Confirmation Required
            </Text>
          </Box>
          <Box flexDirection='column' marginBottom={1}>
            <Text color={currentTheme.colors.text.primary} bold>
              Tool: {confirmationData.toolName}
            </Text>
            <Text color={currentTheme.colors.text.secondary}>{confirmationData.description}</Text>
          </Box>
          {confirmationData.args && Object.keys(confirmationData.args).length > 0 && (
            <Box flexDirection='column' marginBottom={1}>
              <Text color={currentTheme.colors.text.muted}>Parameters:</Text>
              <Box marginLeft={2}>
                <Text color={currentTheme.colors.text.secondary}>{JSON.stringify(confirmationData.args, null, 2)}</Text>
              </Box>
            </Box>
          )}
          <Box>
            <Text color={selectedChoice === 'yes' ? currentTheme.colors.success : currentTheme.colors.text.primary} bold={selectedChoice === 'yes'}>
              {selectedChoice === 'yes' ? '> ' : '  '}Yes
            </Text>
            <Text color={currentTheme.colors.text.primary}> / </Text>
            <Text color={selectedChoice === 'no' ? currentTheme.colors.error : currentTheme.colors.text.primary} bold={selectedChoice === 'no'}>
              {selectedChoice === 'no' ? '> ' : '  '}No
            </Text>
          </Box>
        </Box>
        <Box borderStyle='round' borderColor={currentTheme.colors.warning} paddingX={1} paddingY={0}>
          <Box alignItems='center' width='100%'>
            <Text color={currentTheme.colors.warning} bold>
              ⏳
            </Text>
            <Box marginLeft={1}>
              <Text color={currentTheme.colors.warning}>Waiting for confirmation...</Text>
            </Box>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color={currentTheme.colors.text.muted}>
            <Text color={currentTheme.colors.accent}>←/→</Text> Select •<Text color={currentTheme.colors.accent}>Enter</Text> Confirm •<Text color={currentTheme.colors.accent}>Esc</Text> Cancel
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection='column'>
      <Box borderStyle='round' borderColor={isProcessing ? currentTheme.colors.warning : currentTheme.colors.ui.border} paddingX={1} paddingY={0}>
        <Box alignItems='center' width='100%'>
          <Text color={isProcessing ? currentTheme.colors.warning : currentTheme.colors.success} bold>
            {isProcessing ? '⏳ ' : '❯ '}
          </Text>
          {!isProcessing ? (
            <Box flexGrow={1} marginLeft={1}>
              <Text color={currentTheme.colors.text.primary}>
                <TextInput value={input} onChange={setInput} onSubmit={handleInternalSubmit} placeholder={placeholder} showCursor={true} />
              </Text>
            </Box>
          ) : (
            <Box marginLeft={1}>
              <Text color={currentTheme.colors.warning}>Processing your request...</Text>
            </Box>
          )}
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={currentTheme.colors.text.muted}>
          Type <Text color={currentTheme.colors.accent}>/help</Text> for commands •<Text color={currentTheme.colors.accent}>Ctrl+C</Text> to exit
        </Text>
      </Box>
    </Box>
  );
};
