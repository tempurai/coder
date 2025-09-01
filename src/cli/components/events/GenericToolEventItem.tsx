import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent } from '../../../events/index.js';
import { useTheme } from '../../themes/index.js';
import { StatusIndicator } from '../StatusIndicator.js';

interface GenericToolEventItemProps {
  event: UIEvent;
  index: number;
}

export const GenericToolEventItem: React.FC<GenericToolEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();
  const toolEvent = event as any;

  const executionStatus = toolEvent.executionStatus || 'started';
  const completedData = toolEvent.completedData;
  const outputData = toolEvent.outputData;

  const displayTitle = toolEvent.displayTitle || 'Tool';

  // 确定状态
  const isCompleted = executionStatus === 'completed' || executionStatus === 'failed';
  const isSuccess = executionStatus === 'completed';
  const isError = executionStatus === 'failed';

  // 获取输出内容
  let outputContent = '';
  if (isCompleted && completedData) {
    if (completedData.displayDetails) {
      outputContent = completedData.displayDetails;
    } else if (completedData.result) {
      if (typeof completedData.result === 'object') {
        outputContent = JSON.stringify(completedData.result, null, 2);
      } else {
        outputContent = String(completedData.result);
      }
    }

    if (completedData.error) {
      outputContent = completedData.error;
    }
  } else if (outputData && outputData.length > 0) {
    // 显示最新的输出
    const latestOutput = outputData[outputData.length - 1];
    if (latestOutput.content && !latestOutput.content.startsWith('Executing:')) {
      outputContent = latestOutput.content;
    }
  }

  const indicatorType = isError ? 'error' : 'tool';
  const statusSymbol = isError ? '✗' : isCompleted ? '✓' : '~';

  return (
    <Box flexDirection='column'>
      {/* 工具标题行 */}
      <Box>
        <Box marginRight={1}>
          <StatusIndicator type={indicatorType} isActive={!isCompleted} />
        </Box>
        <Text color={isError ? currentTheme.colors.error : currentTheme.colors.text.primary} bold>
          {statusSymbol} {displayTitle}
        </Text>
      </Box>

      {/* 输出内容 */}
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
