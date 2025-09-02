import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../themes/index.js';
import { MAX_FRAME_WIDTH } from './base.js';
import { ConfirmationChoice } from '../../services/HITLManager.js';
import { ExecutionModeSelector } from './ExecutionModeSelector.js';
import { ExecutionMode } from '../../services/ExecutionModeManager.js';
import { useCommandProcessor } from '../hooks/useCommandProcessor.js';

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

type InputMode = 'normal' | 'execution-mode' | 'command-help';

interface DynamicInputProps {
  onSubmit: (value: string, executionMode: ExecutionMode) => void;
  isProcessing: boolean;
  confirmationData?: ConfirmationData | null;
  onConfirm?: (confirmationId: string, choice: ConfirmationChoice) => void;
  editModeStatus?: string;
  onEditModeToggle?: () => void;
  executionMode?: ExecutionMode;
  onExecutionModeChange?: (mode: ExecutionMode) => void;
}

export const DynamicInput: React.FC<DynamicInputProps> = ({ onSubmit, isProcessing, confirmationData, onConfirm, editModeStatus, onEditModeToggle, executionMode = ExecutionMode.CODE, onExecutionModeChange }) => {
  const { currentTheme } = useTheme();
  const [input, setInput] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<ConfirmationChoice>(ConfirmationChoice.YES);
  const [inputMode, setInputMode] = useState<InputMode>('normal');
  const [commandHelp, setCommandHelp] = useState<string>('');

  const { processCommand } = useCommandProcessor();

  const isConfirmationMode = !!confirmationData;
  const showRememberOption = confirmationData?.options?.showRememberOption !== false;
  const isEditOperation = confirmationData?.options?.isEditOperation || false;

  const choices: ConfirmationChoice[] = showRememberOption ? [ConfirmationChoice.YES, ConfirmationChoice.NO, ConfirmationChoice.YES_AND_REMEMBER] : [ConfirmationChoice.YES, ConfirmationChoice.NO];

  const handleInternalSubmit = useCallback(() => {
    if (input.trim()) {
      // 前端命令直接处理，不传后端
      if (input.trim() === ':') {
        setInputMode('execution-mode');
        setInput('');
        return; // 截断，不传给后端
      }

      if (input.startsWith('/')) {
        const result = processCommand(input);
        if (result.processed && result.helpContent) {
          setCommandHelp(result.helpContent);
          setInputMode('command-help');
          setInput('');
          return; // 截断，不传给后端
        }
      }

      // 只有普通输入才传给后端，并传入当前执行模式
      onSubmit(input, executionMode);
      setInput('');
    }
  }, [input, onSubmit, processCommand, executionMode]);

  const handleExecutionModeSelected = useCallback(
    (mode: ExecutionMode) => {
      if (onExecutionModeChange) {
        onExecutionModeChange(mode);
      }
      setInputMode('normal');
    },
    [onExecutionModeChange],
  );

  const handleExecutionModeCancel = useCallback(() => {
    setInputMode('normal');
  }, []);

  const handleCommandHelpDismiss = useCallback(() => {
    setInputMode('normal');
    setCommandHelp('');
  }, []);

  const getChoiceIndex = (choice: ConfirmationChoice) => choices.indexOf(choice);
  const getChoiceAtIndex = (index: number) => choices[index];

  useInput(
    (char, key) => {
      if (key.shift && key.tab && !isConfirmationMode && onEditModeToggle && inputMode === 'normal') {
        onEditModeToggle();
        return;
      }

      if (inputMode === 'command-help') {
        handleCommandHelpDismiss();
        return;
      }

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
            onConfirm(confirmationData.confirmationId, ConfirmationChoice.NO);
          }
        } else if (char.toLowerCase() === 'y') {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, ConfirmationChoice.YES);
        } else if (char.toLowerCase() === 'n') {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, ConfirmationChoice.NO);
        } else if (char.toLowerCase() === 'a' && showRememberOption) {
          if (confirmationData && onConfirm) onConfirm(confirmationData.confirmationId, ConfirmationChoice.YES_AND_REMEMBER);
        }
      }
    },
    { isActive: true },
  );

  const getChoiceText = (choice: ConfirmationChoice) => {
    switch (choice) {
      case ConfirmationChoice.YES:
        return isEditOperation ? 'Yes (this time only)' : 'Yes';
      case ConfirmationChoice.NO:
        return 'No';
      case ConfirmationChoice.YES_AND_REMEMBER:
        return isEditOperation ? "Yes, and don't ask again for edits during this session" : 'Yes and remember this choice';
    }
  };

  const getChoiceColor = (choice: ConfirmationChoice, isSelected: boolean) => {
    if (!isSelected) return currentTheme.colors.text.secondary;
    switch (choice) {
      case ConfirmationChoice.YES:
        return currentTheme.colors.success;
      case ConfirmationChoice.NO:
        return currentTheme.colors.error;
      case ConfirmationChoice.YES_AND_REMEMBER:
        return currentTheme.colors.warning;
    }
  };

  const getEditModeIcon = (status?: string): string => {
    if (!status) return '?';
    if (status.includes('Always accept')) return '>>';
    return '?';
  };

  // Show execution mode selector
  if (inputMode === 'execution-mode') {
    return (
      <Box flexDirection='column'>
        <ExecutionModeSelector currentMode={executionMode} onModeSelected={handleExecutionModeSelected} onCancel={handleExecutionModeCancel} />
      </Box>
    );
  }

  // Show command help
  if (inputMode === 'command-help') {
    return (
      <Box flexDirection='column'>
        <Box paddingX={1} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
          <Box flexDirection='column'>
            <Text color={currentTheme.colors.primary} bold>
              Command Help
            </Text>
            <Box marginTop={1}>
              <Text color={currentTheme.colors.text.primary}>{commandHelp}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={currentTheme.colors.text.muted}>Press any key to continue</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection='column'>
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

      {!isConfirmationMode && (
        <Box borderStyle='round' borderColor={currentTheme.colors.ui.border} paddingX={1} paddingY={0}>
          <Box alignItems='center' width='100%'>
            <Text color={currentTheme.colors.text.primary}>
              <TextInput value={input} onChange={setInput} onSubmit={handleInternalSubmit} showCursor={true} />
            </Text>
          </Box>
        </Box>
      )}

      <Box flexDirection='column'>
        {editModeStatus && !isConfirmationMode && (
          <Box marginBottom={0}>
            <Text color={currentTheme.colors.text.muted}>
              {getEditModeIcon(editModeStatus)} {editModeStatus} •<Text color={currentTheme.colors.accent}>Shift+Tab</Text> to cycle
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
              Type <Text color={currentTheme.colors.accent}>:</Text> for execution mode • <Text color={currentTheme.colors.accent}>/help</Text> for commands •<Text color={currentTheme.colors.accent}>Ctrl+C</Text> to exit
              {!isConfirmationMode && editModeStatus && (
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
  );
};
