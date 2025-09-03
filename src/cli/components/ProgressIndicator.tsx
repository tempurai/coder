import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useTheme } from '../themes/index.js';
import { SessionService } from '../../services/SessionService.js';
import { useState, useEffect } from 'react';
import { TodoManager } from '../../agents/smart_agent/TodoManager.js';

interface ProgressIndicatorProps {
  phase: string;
  message: string;
  progress?: number;
  isActive?: boolean;
  showSpinner?: boolean;
  sessionService?: SessionService;
}

const HELP_TEXTS = ['Ready for your next task', 'Type : to select execution mode', 'Use /help for available commands', 'Waiting for instructions...', 'AI assistant ready to help'];

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ phase, message, progress, isActive = true, showSpinner = true, sessionService }) => {
  const { currentTheme } = useTheme();
  const [currentTodo, setCurrentTodo] = useState<string | null>(null);
  const [nextTodo, setNextTodo] = useState<string | null>(null);
  const [todoManager, setTodoManager] = useState<TodoManager | null>(null);
  const [todoDisplay, setTodoDisplay] = useState<{ current?: string; next?: string }>({});

  useEffect(() => {
    if (!sessionService) return;

    const updateTodos = () => {
      try {
        const todos = sessionService.todoManager.getAllTodos();
        const current = todos.find((todo) => todo.status === 'in_progress');
        const pending = todos.filter((todo) => todo.status === 'pending').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        setCurrentTodo(current?.title || null);
        setNextTodo(pending[0]?.title || null);
      } catch (error) {
        setCurrentTodo(null);
        setNextTodo(null);
      }
    };

    updateTodos();
    const interval = setInterval(updateTodos, 1000);
    return () => clearInterval(interval);
  }, [sessionService]);

  useEffect(() => {
    if (!sessionService?.todoManager) return;

    const updateTodos = () => {
      try {
        const todos = sessionService.todoManager.getAllTodos();
        const current = todos.find((todo) => todo.status === 'in_progress');
        const pending = todos.filter((todo) => todo.status === 'pending').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        setTodoDisplay({
          current: current?.title,
          next: pending[0]?.title,
        });
      } catch (error) {
        setTodoDisplay({});
      }
    };

    updateTodos();
    const interval = setInterval(updateTodos, 1000);
    return () => clearInterval(interval);
  }, [sessionService]);

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

  // 获取主要显示内容
  const getMainTitle = (): { symbol: string; content: string; color: string } => {
    if (todoDisplay.current) {
      return {
        symbol: '⏵',
        content: todoDisplay.current,
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
    <Box flexDirection='column' marginTop={1}>
      {/* 主要内容 */}
      <Box>
        {mainTitle.symbol && (
          <>
            {isActive && showSpinner && !todoDisplay.current ? (
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

      {/* 显示下一个待处理的todo */}
      {todoDisplay.next && (
        <Box>
          <Text color={currentTheme.colors.text.muted}>◦</Text>
          <Box marginLeft={1}>
            <Text color={currentTheme.colors.text.muted}>{todoDisplay.next}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
