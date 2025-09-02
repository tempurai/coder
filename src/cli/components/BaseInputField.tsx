import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../themes/index.js';

interface BaseInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  isActive: boolean;
  placeholder?: string;
}

export const BaseInputField: React.FC<BaseInputFieldProps> = ({ value, onChange, onSubmit, isProcessing, isActive, placeholder }) => {
  const { currentTheme } = useTheme();

  return (
    <Box borderStyle='round' borderColor={currentTheme.colors.ui.border} paddingX={1} paddingY={0}>
      <Box alignItems='center' width='100%'>
        <Text color={currentTheme.colors.text.primary}>
          <TextInput value={value} onChange={onChange} onSubmit={onSubmit} showCursor={isActive && !isProcessing} placeholder={placeholder} />
        </Text>
      </Box>
    </Box>
  );
};
