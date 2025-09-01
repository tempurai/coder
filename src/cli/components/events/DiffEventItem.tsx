import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent } from '../../../events/index.js';
import { useTheme } from '../../themes/index.js';
import { StatusIndicator } from '../StatusIndicator.js';

interface DiffEventItemProps {
  event: UIEvent;
  index: number;
}

export const DiffEventItem: React.FC<DiffEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();
  const toolEvent = event as any;

  const executionStatus = toolEvent.executionStatus || 'started';
  const completedData = toolEvent.completedData;
  const displayTitle = toolEvent.displayTitle || 'Diff';

  const isCompleted = executionStatus === 'completed' || executionStatus === 'failed';
  const isError = executionStatus === 'failed';

  let diffContent = '';
  if (isCompleted && completedData) {
    diffContent = completedData.displayDetails || completedData.error || '';
  }

  const indicatorType = isError ? 'error' : 'tool';
  const statusSymbol = isError ? '✗' : isCompleted ? '✓' : '~';

  return (
    <Box flexDirection='column'>
      <Box>
        <Box marginRight={1}>
          <StatusIndicator type={indicatorType} isActive={!isCompleted} />
        </Box>
        <Text color={isError ? currentTheme.colors.error : currentTheme.colors.text.primary} bold>
          {statusSymbol} {displayTitle}
        </Text>
      </Box>

      {diffContent && (
        <Box marginLeft={2}>
          <Text color={currentTheme.colors.text.muted}>⎿ </Text>
          <Box flexGrow={1}>
            <Text color={currentTheme.colors.text.secondary} wrap='wrap'>
              {diffContent}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
