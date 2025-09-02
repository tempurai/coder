import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../themes/index.js';
import { MAX_FRAME_WIDTH } from './base.js';

interface ConfirmationData {
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
  options?: {
    showRememberOption?: boolean;
    defaultChoice?: 'yes' | 'no' | 'yes_and_remember';
    timeout?: number;
    isEditOperation?: boolean;
  };
}

interface DynamicInputProps {
  onSubmit: (value: string) => void;
  isProcessing: boolean;
  confirmationData?: ConfirmationData | null;
  onConfirm?: (confirmationId: string, choice: 'yes' | 'no' | 'yes_and_remember') => void;
  editModeStatus?: string;
  onEditModeToggle?: () => void;
}

type ConfirmationChoice = 'yes' | 'no' | 'yes_and_remember';

export const DynamicInput: React.FC<DynamicInputProps> = ({ onSubmit, isProcessing, confirmationData, onConfirm, editModeStatus, onEditModeToggle }) => {
  const { currentTheme } = useTheme();
  const [input, setInput] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<ConfirmationChoice>('yes');

  const isConfirmationMode = !!confirmationData;
  const showRememberOption = confirmationData?.options?.showRememberOption !== false;
  const isEditOperation = confirmationData?.options?.isEditOperation || false;

  const choices: ConfirmationChoice[] = showRememberOption ? ['yes', 'no', 'yes_and_remember'] : ['yes', 'no'];

  const handleInternalSubmit = useCallback(() => {
    if (input.trim()) {
      onSubmit(input);
      setInput('');
    }
  }, [input, onSubmit]);

  const getChoiceIndex = (choice: ConfirmationChoice) => choices.indexOf(choice);
  const getChoiceAtIndex = (index: number) => choices[index];

  useInput(
    (char, key) => {
      // Handle edit mode toggle (Shift+Tab)
      if (key.shift && key.tab && !isConfirmationMode && onEditModeToggle) {
        onEditModeToggle();
        return;
      }

      // Confirmation mode input handling
      if (isConfirmationMode) {
        if (key.upArrow) {
          const currentIndex = getChoiceIndex(selectedChoice);
          const newIndex = currentIndex > 0 ? currentIndex - 1 : choices.length - 1;
          setSelectedChoice(getChoiceAtIndex(newIndex));
        } else if (key.downArrow) {
          const currentIndex = getChoiceIndex(selectedChoice);
          const newIndex = currentIndex < choices.length - 1 ? currentIndex + 1 : 0;
          setSelectedChoice(getChoiceAtIndex(newIndex));
        } else if (key.return) {
          if (confirmationData && onConfirm) {
            onConfirm(confirmationData.confirmationId, selectedChoice);
          }
        } else if (key.escape) {
          if (confirmationData && onConfirm) {
            onConfirm(confirmationData.confirmationId, 'no');
          }
        } else if (char.toLowerCase() === 'y') {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, 'yes');
        } else if (char.toLowerCase() === 'n') {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, 'no');
        } else if (char.toLowerCase() === 'a' && showRememberOption) {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, 'yes_and_remember');
        }
      }
    },
    { isActive: true },
  );

  const getChoiceText = (choice: ConfirmationChoice) => {
    switch (choice) {
      case 'yes':
        return isEditOperation ? 'Yes (this time only)' : 'Yes';
      case 'no':
        return 'No';
      case 'yes_and_remember':
        return isEditOperation ? "Yes, and don't ask again for edits during this session" : 'Yes and remember this choice';
    }
  };

  const getChoiceColor = (choice: ConfirmationChoice, isSelected: boolean) => {
    if (!isSelected) return currentTheme.colors.text.secondary;

    switch (choice) {
      case 'yes':
        return currentTheme.colors.success;
      case 'no':
        return currentTheme.colors.error;
      case 'yes_and_remember':
        return currentTheme.colors.warning;
    }
  };

  const getEditModeIcon = (status?: string): string => {
    if (!status) return '?';

    if (status.includes('Always accept')) return '>>';
    if (status.includes('plan mode on')) return 'plan mode on';
    return '?';
  };

  return (
    <Box flexDirection='column'>
      {/* Edit Operation Confirmation */}
      {isConfirmationMode && confirmationData && (
        <Box width={MAX_FRAME_WIDTH} flexDirection='column'>
          <Box flexDirection='column' marginY={1} paddingX={2} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.warning}>
            <Box marginBottom={1}>
              <Text color={currentTheme.colors.warning} bold>
                {isEditOperation ? 'File Edit Confirmation' : 'Command Confirmation Required'}
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

            <Box flexDirection='column' marginBottom={1}>
              <Text color={currentTheme.colors.text.primary} bold>
                Do you want to proceed?
              </Text>
              {choices.map((choice, index) => (
                <Box key={choice} marginLeft={2}>
                  <Text color={getChoiceColor(choice, selectedChoice === choice)} bold={selectedChoice === choice}>
                    {selectedChoice === choice ? '▶ ' : '  '}
                    {index + 1}. {getChoiceText(choice)}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>

          <Text color={currentTheme.colors.text.muted}>
            <Text color={currentTheme.colors.accent}>↑/↓</Text> Navigate •<Text color={currentTheme.colors.accent}>Enter</Text> Confirm •<Text color={currentTheme.colors.accent}>Esc</Text> Cancel
            {showRememberOption && (
              <>
                {' '}
                • <Text color={currentTheme.colors.accent}>Y/N/A</Text> Quick select
              </>
            )}
          </Text>
        </Box>
      )}

      {/* Regular Input */}
      {!isConfirmationMode && (
        <Box borderStyle='round' borderColor={currentTheme.colors.ui.border} paddingX={1} paddingY={0}>
          <Box alignItems='center' width='100%'>
            <Text color={currentTheme.colors.text.primary}>
              <TextInput value={input} onChange={setInput} onSubmit={handleInternalSubmit} showCursor={true} />
            </Text>
          </Box>
        </Box>
      )}

      {/* Status and Help Text */}
      <Box flexDirection='column'>
        {/* Edit Mode Status */}
        {editModeStatus && !isConfirmationMode && (
          <Box marginBottom={0}>
            <Text color={currentTheme.colors.text.muted}>
              {getEditModeIcon(editModeStatus)} {editModeStatus} •<Text color={currentTheme.colors.accent}>Shift+Tab</Text> to cycle
            </Text>
          </Box>
        )}

        {/* Regular Help Text */}
        <Text color={currentTheme.colors.text.muted}>
          {isProcessing ? (
            <>
              Type commands to queue them • <Text color={currentTheme.colors.accent}>Ctrl+C</Text> to exit
            </>
          ) : (
            <>
              Type <Text color={currentTheme.colors.accent}>/help</Text> for commands •<Text color={currentTheme.colors.accent}>Ctrl+C</Text> to exit
              {!isConfirmationMode && editModeStatus && (
                <>
                  {' '}
                  • <Text color={currentTheme.colors.accent}>Shift+Tab</Text> cycle mode
                </>
              )}
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
};
