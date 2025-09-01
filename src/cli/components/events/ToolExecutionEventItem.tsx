import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent } from '../../../events/index.js';
import { useTheme } from '../../themes/index.js';
import { StatusIndicator } from '../StatusIndicator.js';

interface ToolExecutionEventItemProps {
  event: UIEvent;
  index: number;
}

export const ToolExecutionEventItem: React.FC<ToolExecutionEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();
  const toolEvent = event as any;

  const executionStatus = toolEvent.executionStatus || 'started';
  const completedData = toolEvent.completedData;
  const outputData = toolEvent.outputData;

  let displayTitle = toolEvent.displayTitle;

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
      if (typeof completedData.result === 'object' && completedData.result.stdout) {
        outputContent = completedData.result.stdout;
      } else if (typeof completedData.result === 'string') {
        outputContent = completedData.result;
      } else {
        outputContent = JSON.stringify(completedData.result, null, 2);
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

  // 处理特殊的多命令显示
  const isMultiCommand = toolEvent.toolName === 'multi_command';

  return (
    <Box flexDirection='column'>
      {/* 工具名称行 */}
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
          <Box flexDirection='column' flexGrow={1}>
            {isMultiCommand ? (
              <Box flexDirection='column'>{formatMultiCommandOutput(outputContent, currentTheme)}</Box>
            ) : (
              <Text color={currentTheme.colors.text.secondary}>{truncateOutput(outputContent, isError ? 300 : 200)}</Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

function formatMultiCommandOutput(content: string, theme: any): React.ReactNode[] {
  const lines = content.split('\n');
  return lines.slice(0, 8).map((line, idx) => {
    if (line.trim().startsWith('⎿')) {
      return (
        <Box key={idx} marginLeft={2}>
          <Text color={theme.colors.text.muted}>{line}</Text>
        </Box>
      );
    } else {
      return (
        <Text key={idx} color={theme.colors.text.secondary}>
          {line}
        </Text>
      );
    }
  });
}

function truncateOutput(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // 尝试在行边界截断
  const lines = text.split('\n');
  let result = '';

  for (const line of lines) {
    if ((result + line + '\n').length > maxLength) {
      if (result.length === 0) {
        // 单行过长，强制截断
        return line.substring(0, maxLength - 5) + ' (...)';
      } else {
        return result.trim() + '\n(...)';
      }
    }
    result += line + '\n';
  }

  return result.trim();
}
