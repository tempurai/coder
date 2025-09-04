import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../themes/index.js';
import { ExecutionMode } from '../../services/ExecutionModeManager.js';

interface BaseInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  isActive: boolean;
  placeholder?: string;
  executionMode?: ExecutionMode;
}

export const BaseInputField: React.FC<BaseInputFieldProps> = ({ value, onChange, onSubmit, isProcessing, isActive, placeholder, executionMode }) => {
  const { currentTheme } = useTheme();
  const modePrefix = executionMode ? `(${executionMode.toUpperCase()}) ` : '';

  return (
    <Box borderStyle='round' borderColor={currentTheme.colors.ui.border} paddingX={1} paddingY={0}>
      <Box alignItems='center' width='100%'>
        <Text color={currentTheme.colors.text.secondary}>
          {modePrefix}
          {'> '}
        </Text>
        <Text color={currentTheme.colors.text.primary}>
          <TextInput value={value} onChange={onChange} onSubmit={onSubmit} showCursor={isActive && !isProcessing} placeholder={placeholder} />
        </Text>
      </Box>
    </Box>
  );
};
