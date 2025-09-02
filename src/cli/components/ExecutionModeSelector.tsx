import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';
import { ExecutionMode, ExecutionModeData } from '../../services/ExecutionModeManager.js';

interface ExecutionModeSelectorProps {
  currentMode: ExecutionMode;
  onModeSelected: (mode: ExecutionMode) => void;
  onCancel: () => void;
}

export const ExecutionModeSelector: React.FC<ExecutionModeSelectorProps> = ({ currentMode, onModeSelected, onCancel }) => {
  const { currentTheme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const currentModeIndex = ExecutionModeData.findIndex((m) => m.mode === currentMode);
    if (currentModeIndex !== -1) {
      setSelectedIndex(currentModeIndex);
    }
  }, [currentMode]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : ExecutionModeData.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < ExecutionModeData.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      onModeSelected(ExecutionModeData[selectedIndex].mode);
    } else if (key.escape) {
      onCancel();
    } else if (input === '1' || input === '2') {
      const index = parseInt(input) - 1;
      if (index >= 0 && index < ExecutionModeData.length) {
        onModeSelected(ExecutionModeData[index].mode);
      }
    }
  });

  return (
    <Box flexDirection='column' paddingX={1} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
      <Box marginBottom={1}>
        <Text color={currentTheme.colors.primary} bold>
          Select Execution Mode
        </Text>
      </Box>

      <Box flexDirection='column'>
        {ExecutionModeData.map((modeData, index) => (
          <Box key={modeData.mode} flexDirection='row' marginY={0}>
            <Box width={25}>
              <Text color={index === selectedIndex ? currentTheme.colors.accent : currentTheme.colors.text.primary} bold={index === selectedIndex}>
                {index === selectedIndex ? '▶ ' : '  '}
                {index + 1}. {modeData.displayName}
                {modeData.mode === currentMode ? ' (current)' : ''}
              </Text>
            </Box>
            <Text color={currentTheme.colors.text.muted}>{modeData.description}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.accent}>↑/↓</Text> Navigate •<Text color={currentTheme.colors.accent}>Enter</Text> Select •<Text color={currentTheme.colors.accent}>1/2</Text> Quick select •
          <Text color={currentTheme.colors.accent}>Esc</Text> Cancel
        </Text>
      </Box>
    </Box>
  );
};
