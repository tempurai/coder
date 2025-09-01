import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent } from '../../../events/index.js';
import { useTheme } from '../../themes/index.js';
import { StatusIndicator } from '../StatusIndicator.js';

interface ShellExecutionEventItemProps {
  event: UIEvent;
  index: number;
}

export const ShellExecutionEventItem: React.FC<ShellExecutionEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();
  const toolEvent = event as any;

  const executionStatus = toolEvent.executionStatus || 'started';
  const completedData = toolEvent.completedData;
  const outputData = toolEvent.outputData;

  const displayTitle = toolEvent.displayTitle || 'Shell Command';

  const isCompleted = executionStatus === 'completed' || executionStatus === 'failed';
  const isError = executionStatus === 'failed';

  // 获取输出内容
  let outputContent = '';
  if (isCompleted && completedData) {
    if (completedData.displayDetails) {
      outputContent = completedData.displayDetails;
    } else if (completedData.result?.stdout) {
      outputContent = completedData.result.stdout;
    } else if (completedData.error) {
      outputContent = completedData.error;
    }
  } else if (outputData && outputData.length > 0) {
    const latestOutput = outputData[outputData.length - 1];
    if (latestOutput.content && !latestOutput.content.startsWith('Executing:')) {
      outputContent = latestOutput.content;
    }
  }

  // 限制行数：stdout 10行，stderr 20行
  if (outputContent) {
    const lines = outputContent.split('\n');
    const maxLines = isError ? 20 : 10;

    if (lines.length > maxLines) {
      outputContent = lines.slice(0, maxLines).join('\n') + `\n(...${lines.length - maxLines} more lines)`;
    }
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

      {outputContent && (
        <Box marginLeft={2}>
          <Text color={currentTheme.colors.text.muted}>⎿ </Text>
          <Box flexGrow={1}>
            <Text color={currentTheme.colors.text.secondary} wrap='wrap'>
              {outputContent}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
