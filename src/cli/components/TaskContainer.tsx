import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';
import { UIEvent } from '../../events/index.js';
import { EventStream } from './EventStream.js';
import { ProgressIndicator } from './ProgressIndicator.js';

interface TaskContainerProps {
  events: UIEvent[];
  isProcessing: boolean;
  currentActivity: string;
  detailMode: boolean;
  children?: React.ReactNode;
}

export const TaskContainer: React.FC<TaskContainerProps> = ({ events, isProcessing, currentActivity, detailMode, children }) => {
  const { currentTheme } = useTheme();

  return (
    <Box flexDirection='column'>
      <Box>
        <Text color={currentTheme.colors.ui.highlight}>{'⚡'} </Text>
        <Text color={currentTheme.colors.primary} bold>
          Tempurai Code Assistant
        </Text>
      </Box>

      {isProcessing && (
        <Box marginY={1}>
          <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} />
        </Box>
      )}

      <EventStream events={events} detailMode={detailMode} />

      {children}
    </Box>
  );
};
