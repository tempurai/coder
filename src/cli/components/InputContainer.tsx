import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';
import { ExecutionMode } from '../../services/ExecutionModeManager.js';
import { BaseInputField } from './BaseInputField.js';
import { SessionService } from '../../services/SessionService.js';
import { useUiStore } from '../stores/uiStore.js';

interface InputContainerProps {
  onSubmit: (value: string) => void;
  isProcessing: boolean;
  onEditModeToggle?: () => void;
  sessionService: SessionService;
  exit: () => void;
  focus: boolean;
}

export const InputContainer: React.FC<InputContainerProps> = ({ onSubmit, isProcessing, onEditModeToggle, sessionService, exit, focus }) => {
  const { currentTheme } = useTheme();
  const [input, setInput] = useState('');
  const [ctrlCCount, setCtrlCCount] = useState<number>(0);

  // 从 store 中获取状态和 actions
  const { executionMode, initialInputValue, actions } = useUiStore();
  const { setActivePanel } = actions;

  // 当 store 中的 initialInputValue 更新时，同步到本地 input state
  useEffect(() => {
    if (initialInputValue) {
      setInput(initialInputValue);
      // 消费掉 initialValue 后，立即将其在 store 中重置，
      // 并确保 activePanel 是 'INPUT'
      setActivePanel('INPUT');
    }
  }, [initialInputValue, setInput, setActivePanel]);

  useEffect(() => {
    if (ctrlCCount > 0) {
      const timer = setTimeout(() => setCtrlCCount(0), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [ctrlCCount]);

  const handleInputChange = useCallback(
    (value: string) => {
      // 触发逻辑现在只处理打开面板的情况
      if (value === ':') {
        setActivePanel('EXECUTION_MODE');
        setInput('');
        return;
      }
      if (value === '/') {
        setActivePanel('COMMAND_PALETTE');
        setInput('');
        return;
      }
      if (value === '?') {
        setActivePanel('HELP');
        setInput('');
        return;
      }
      setInput(value);
    },
    [setActivePanel],
  );

  const handleInputSubmit = useCallback(() => {
    if (input.trim() && !isProcessing) {
      onSubmit(input);
      setInput('');
    }
  }, [input, onSubmit, isProcessing]);

  useInput(
    (char, key) => {
      if (key.ctrl && char.toLowerCase() === 'c') {
        if (input.trim()) {
          setInput('');
        } else {
          setCtrlCCount((prev) => prev + 1);
          if (ctrlCCount >= 1) {
            sessionService.interrupt();
            exit();
          }
        }
        return;
      } else {
        if (ctrlCCount > 0) {
          setCtrlCCount(0);
        }
      }

      if (key.ctrl && char === 't') {
        setActivePanel('THEME');
        return;
      }

      if (key.shift && key.tab && onEditModeToggle) {
        onEditModeToggle();
        return;
      }
    },
    { isActive: focus },
  );

  const editModeStatus = sessionService.editModeManager.getStatusMessage();

  return (
    <Box flexDirection='column'>
      <BaseInputField value={input} onChange={handleInputChange} onSubmit={handleInputSubmit} isProcessing={isProcessing} isActive={focus} executionMode={executionMode} focus={focus} />
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
              Type <Text color={currentTheme.colors.accent}>:</Text> for execution mode •<Text color={currentTheme.colors.accent}>/help</Text> for commands •<Text color={currentTheme.colors.accent}>Ctrl+T</Text> for themes •
              <Text color={currentTheme.colors.accent}>Ctrl+C</Text> to clear/exit
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
  );
};
