import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useTheme } from '../themes/index.js';
import { ErrorState, TodoState } from '../hooks/useSessionEvents.js';

interface ProgressIndicatorProps {
  phase: string;
  message: string;
  progress?: number;
  isActive?: boolean;
  showSpinner?: boolean;
  todoState?: TodoState;
  errorState?: ErrorState;
}

const HELP_TEXTS = ['Ready for your next task', 'Type : to select execution mode', 'Use /help for available commands', 'Waiting for instructions...', 'AI assistant ready to help'];

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ phase, message, progress, isActive = true, showSpinner = true, todoState, errorState }) => {
  const { currentTheme } = useTheme();

  const getPhaseSymbol = (phase: string) => {
    switch (phase.toLowerCase()) {
      case 'searching':
      case 'finding':
        return '?';
      case 'reading':
      case 'loading':
        return '>';
      case 'writing':
      case 'saving':
        return '<';
      case 'executing':
      case 'running':
        return '~';
      case 'analyzing':
      case 'processing':
        return '*';
      case 'connecting':
      case 'fetching':
        return '^';
      case 'completed':
      case 'done':
        return '✓';
      case 'failed':
      case 'error':
        return '!';
      default:
        return '•';
    }
  };

  const phaseSymbol = getPhaseSymbol(phase);
  const showProgress = typeof progress === 'number' && progress >= 0 && progress <= 100;

  // 确定主标题内容
  const getMainTitle = (): { symbol: string; content: string; color: string } => {
    // 如果有当前ToDo，显示当前ToDo
    if (todoState?.current) {
      return {
        symbol: '⏵',
        content: todoState.current.title,
        color: currentTheme.colors.accent,
      };
    }

    // 如果正在处理任务且有消息，显示任务信息
    if (isActive && message) {
      return {
        symbol: isActive && showSpinner ? '' : phaseSymbol,
        content: `${message}${showProgress ? ` (${progress}%)` : ''}`,
        color: currentTheme.colors.semantic.result,
      };
    }

    // 否则显示帮助文本
    const randomHelp = HELP_TEXTS[Math.floor(Math.random() * HELP_TEXTS.length)];
    return {
      symbol: '💡',
      content: randomHelp,
      color: currentTheme.colors.text.muted,
    };
  };

  const mainTitle = getMainTitle();

  return (
    <Box flexDirection='column'>
      {/* 主标题 */}
      <Box>
        {mainTitle.symbol && (
          <>
            {isActive && showSpinner && !todoState?.current ? (
              <Text color={currentTheme.colors.info}>
                <Spinner type='dots' />
              </Text>
            ) : (
              <Text color={mainTitle.color}>{mainTitle.symbol}</Text>
            )}
            <Box marginLeft={1}>
              <Text color={mainTitle.color}>{mainTitle.content}</Text>
            </Box>
          </>
        )}
        {!mainTitle.symbol && <Text color={mainTitle.color}>{mainTitle.content}</Text>}
      </Box>

      {/* 副标题 - 下一个ToDo */}
      {todoState?.next && (
        <Box>
          <Text color={currentTheme.colors.text.muted}>◦</Text>
          <Box marginLeft={1}>
            <Text color={currentTheme.colors.text.muted}>{todoState.next.title}</Text>
          </Box>
        </Box>
      )}

      {/* 错误列表 - 显示在ToDo信息下方 */}
      {errorState && errorState.errors.length > 0 && (
        <Box flexDirection='column' marginTop={todoState?.current || todoState?.next ? 1 : 0}>
          {errorState.errors.map((error, index) => (
            <Box key={index}>
              <Text color={currentTheme.colors.error}>!</Text>
              <Box marginLeft={1}>
                <Text color={currentTheme.colors.error}>{error}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
