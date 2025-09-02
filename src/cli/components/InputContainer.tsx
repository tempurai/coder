import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';
import { ExecutionMode } from '../../services/ExecutionModeManager.js';
import { ConfirmationChoice } from '../../services/HITLManager.js';
import { BaseInputField } from './BaseInputField.js';
import { CommandPalette } from './CommandPalette.js';
import { ExecutionModeSelector } from './ExecutionModeSelector.js';
import { HelpPanel } from './HelpPanel.js';
import { useInputModeManager } from '../hooks/useInputModeManager.js';

interface ConfirmationData {
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
  options?: {
    showRememberOption?: boolean;
    defaultChoice?: ConfirmationChoice;
    timeout?: number;
    isEditOperation?: boolean;
  };
}

interface InputContainerProps {
  onSubmit: (value: string, executionMode: ExecutionMode) => void;
  isProcessing: boolean;
  confirmationData?: ConfirmationData | null;
  onConfirm?: (confirmationId: string, choice: ConfirmationChoice) => void;
  editModeStatus?: string;
  onEditModeToggle?: () => void;
  executionMode?: ExecutionMode;
  onExecutionModeChange?: (mode: ExecutionMode) => void;
}

export const InputContainer: React.FC<InputContainerProps> = ({ onSubmit, isProcessing, confirmationData, onConfirm, editModeStatus, onEditModeToggle, executionMode = ExecutionMode.CODE, onExecutionModeChange }) => {
  const { currentTheme } = useTheme();
  const [input, setInput] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<ConfirmationChoice>(confirmationData?.options?.defaultChoice ?? ConfirmationChoice.YES);

  const { currentMode, setMode, isPanelMode } = useInputModeManager();

  const isConfirmationMode = !!confirmationData;
  const showRememberOption = confirmationData?.options?.showRememberOption !== false;
  const isEditOperation = confirmationData?.options?.isEditOperation || false;
  const choices: ConfirmationChoice[] = showRememberOption ? [ConfirmationChoice.YES, ConfirmationChoice.NO, ConfirmationChoice.YES_AND_REMEMBER] : [ConfirmationChoice.YES, ConfirmationChoice.NO];

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);

      // Check for special triggers
      if (value === '/') {
        setMode('command');
        setInput('');
        return;
      }
      if (value === ':') {
        setMode('execution');
        setInput('');
        return;
      }
      if (value === '?') {
        setMode('help');
        setInput('');
        return;
      }
    },
    [setMode],
  );

  const handleInputSubmit = useCallback(() => {
    if (input.trim() && !isProcessing && !isConfirmationMode) {
      onSubmit(input, executionMode);
      setInput('');
    }
  }, [input, onSubmit, executionMode, isProcessing, isConfirmationMode]);

  const handleCommandSelect = useCallback(
    (command: string) => {
      setMode('normal');
      setInput(command);
    },
    [setMode],
  );

  const handleExecutionModeSelect = useCallback(
    (mode: ExecutionMode) => {
      if (onExecutionModeChange) {
        onExecutionModeChange(mode);
      }
      setMode('normal');
    },
    [onExecutionModeChange, setMode],
  );

  const handleCancel = useCallback(() => {
    setMode('normal');
  }, [setMode]);

  // Handle confirmation mode input
  useInput(
    (char, key) => {
      if (key.shift && key.tab && !isConfirmationMode && onEditModeToggle && currentMode === 'normal') {
        onEditModeToggle();
        return;
      }

      if (isConfirmationMode) {
        if (key.upArrow) {
          const currentIndex = choices.indexOf(selectedChoice);
          const newIndex = currentIndex > 0 ? currentIndex - 1 : choices.length - 1;
          setSelectedChoice(choices[newIndex]);
        } else if (key.downArrow) {
          const currentIndex = choices.indexOf(selectedChoice);
          const newIndex = currentIndex < choices.length - 1 ? currentIndex + 1 : 0;
          setSelectedChoice(choices[newIndex]);
        } else if (key.return) {
          if (confirmationData && onConfirm) {
            onConfirm(confirmationData.confirmationId, selectedChoice);
          }
        } else if (key.escape) {
          if (confirmationData && onConfirm) {
            onConfirm(confirmationData.confirmationId, ConfirmationChoice.NO);
          }
        } else if (char?.toLowerCase() === 'y') {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, ConfirmationChoice.YES);
        } else if (char?.toLowerCase() === 'n') {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, ConfirmationChoice.NO);
        } else if (char?.toLowerCase() === 'a' && showRememberOption) {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, ConfirmationChoice.YES_AND_REMEMBER);
        }
      }
    },
    { isActive: true },
  );

  const getChoiceText = (choice: ConfirmationChoice): string => {
    switch (choice) {
      case ConfirmationChoice.YES:
        return isEditOperation ? 'Yes (this time only)' : 'Yes';
      case ConfirmationChoice.NO:
        return 'No';
      case ConfirmationChoice.YES_AND_REMEMBER:
        return isEditOperation ? "Yes, and don't ask again for edits during this session" : 'Yes and remember this choice';
      default:
        return 'Unknown';
    }
  };

  const getChoiceColor = (choice: ConfirmationChoice, isSelected: boolean): string => {
    if (!isSelected) return currentTheme.colors.text.secondary;
    switch (choice) {
      case ConfirmationChoice.YES:
        return currentTheme.colors.success;
      case ConfirmationChoice.NO:
        return currentTheme.colors.error;
      case ConfirmationChoice.YES_AND_REMEMBER:
        return currentTheme.colors.warning;
      default:
        return currentTheme.colors.text.primary;
    }
  };

  return (
    <Box flexDirection='column'>
      {/* Confirmation Mode */}
      {isConfirmationMode && confirmationData && (
        <Box flexDirection='column' marginBottom={1}>
          <Box flexDirection='column' paddingX={2} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.warning}>
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
                    {selectedChoice === choice ? '⏵ ' : '  '}
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

      {/* Normal Input Mode */}
      {!isConfirmationMode && (
        <Box flexDirection='column'>
          <BaseInputField value={input} onChange={handleInputChange} onSubmit={handleInputSubmit} isProcessing={isProcessing} isActive={currentMode === 'normal'} />

          {/* Panel Modes */}
          {isPanelMode && (
            <Box marginTop={1}>
              {currentMode === 'command' && <CommandPalette onSelect={handleCommandSelect} onCancel={handleCancel} />}

              {currentMode === 'execution' && onExecutionModeChange && <ExecutionModeSelector currentMode={executionMode} onModeSelected={handleExecutionModeSelect} onCancel={handleCancel} />}

              {currentMode === 'help' && <HelpPanel onCancel={handleCancel} />}
            </Box>
          )}

          {/* Status and Help Text */}
          <Box flexDirection='column'>
            {editModeStatus && (
              <Box marginBottom={0}>
                <Text color={currentTheme.colors.text.muted}>
                  {editModeStatus} • <Text color={currentTheme.colors.text.secondary}>(Shift+Tab to cycle)</Text>
                </Text>
              </Box>
            )}

            <Text color={currentTheme.colors.text.muted}>
              {isProcessing ? (
                <>
                  Type commands to queue them • <Text color={currentTheme.colors.accent}>Ctrl+C</Text> to exit
                </>
              ) : (
                <>
                  Type <Text color={currentTheme.colors.accent}>:</Text> for execution mode •<Text color={currentTheme.colors.accent}>/help</Text> for commands •<Text color={currentTheme.colors.accent}>Ctrl+C</Text> to exit
                  {editModeStatus && (
                    <>
                      {' '}
                      • <Text color={currentTheme.colors.accent}>Shift+Tab</Text> cycle edit mode
                    </>
                  )}
                </>
              )}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
