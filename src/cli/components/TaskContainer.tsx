import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';
import { UIEvent } from '../../events/index.js';

interface TaskContainerProps {
  events: UIEvent[];
  children: React.ReactNode;
}

export const TaskContainer: React.FC<TaskContainerProps> = ({ events, children }) => {
  const { currentTheme } = useTheme();
  return (
    <Box flexDirection='column'>
      {/* Task Header */}
      <Box>
        <Text color={currentTheme.colors.ui.highlight}>{'⚡'} </Text>
        <Text color={currentTheme.colors.primary} bold>
          Tempurai Code Assistant
        </Text>
      </Box>

      {/* Task Content */}
      {children}
    </Box>
  );
};
