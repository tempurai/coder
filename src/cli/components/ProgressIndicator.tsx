import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useTheme } from '../themes/index.js';
import { SessionService } from '../../services/SessionService.js';
import { useState, useEffect } from 'react';
import { TodoStartEvent, TodoEndEvent } from '../../events/EventTypes.js';

interface ProgressIndicatorProps {
  phase: string;
  message: string;
  progress?: number;
  isActive?: boolean;
  showSpinner?: boolean;
  sessionService?: SessionService;
}

interface ActiveTodo {
  todoId: string;
  title: string;
}

interface TodoDisplayState {
  activeTodos: ActiveTodo[];
  nextTodo?: string;
}

// 使用固定文本而不是随机文本，避免不必要的重渲染
const STABLE_HELP_TEXT = 'Ready for your next task';

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ phase, message, progress, isActive = true, showSpinner = true, sessionService }) => {
  const { currentTheme } = useTheme();
  const [todoDisplay, setTodoDisplay] = useState<TodoDisplayState>({
    activeTodos: [],
  });

  useEffect(() => {
    if (!sessionService?.events) {
      return;
    }

    const updateTodoDisplay = (activeTodos: ActiveTodo[]) => {
      let nextTodo: string | undefined;
      try {
        const todos = sessionService.todoManager.getAllTodos();
        const pending = todos.filter((t) => t.status === 'pending')[0];
        nextTodo = pending?.title;
      } catch {
        nextTodo = undefined;
      }

      setTodoDisplay({
        activeTodos: [...activeTodos],
        nextTodo,
      });
    };

    let activeTodos: ActiveTodo[] = [];

    const todoStartSubscription = sessionService.events.on('todo_start', (event: TodoStartEvent) => {
      // 添加到队列
      activeTodos.push({
        todoId: event.todoId,
        title: event.title,
      });
      updateTodoDisplay(activeTodos);
    });

    const todoEndSubscription = sessionService.events.on('todo_end', (event: TodoEndEvent) => {
      // 从队列中删除
      activeTodos = activeTodos.filter((todo) => todo.todoId !== event.todoId);
      updateTodoDisplay(activeTodos);
    });

    // 初始化
    updateTodoDisplay(activeTodos);

    return () => {
      todoStartSubscription.unsubscribe();
      todoEndSubscription.unsubscribe();
    };
  }, [sessionService]);

  const renderTodoStatus = () => {
    const currentTodo = todoDisplay.activeTodos[0];

    if (currentTodo) {
      return (
        <Box flexDirection='column'>
          <Box>
            <Text color={currentTheme.colors.semantic.functionCall}>
              <Spinner type='dots' />
            </Text>
            <Box marginLeft={1}>
              <Text color={currentTheme.colors.accent}>当前任务：{currentTodo.title}</Text>
            </Box>
          </Box>
          {todoDisplay.nextTodo && (
            <Box>
              <Text color={currentTheme.colors.text.muted}>{'  '}L</Text>
              <Box marginLeft={1}>
                <Text color={currentTheme.colors.text.muted}>下一个：{todoDisplay.nextTodo}</Text>
              </Box>
            </Box>
          )}
        </Box>
      );
    }

    return (
      <Box>
        <Text color={currentTheme.colors.info}>●</Text>
        <Box marginLeft={1}>
          <Text color={currentTheme.colors.text.muted}>{STABLE_HELP_TEXT}</Text>
        </Box>
      </Box>
    );
  };

  const renderProcessingStatus = () => {
    const showProgress = typeof progress === 'number' && progress >= 0 && progress <= 100;

    return (
      <Box>
        <Text color={currentTheme.colors.info}>
          <Spinner type='dots' />
        </Text>
        <Box marginLeft={1}>
          <Text color={currentTheme.colors.semantic.result}>
            {message}
            {showProgress ? ` (${progress}%)` : ''}
          </Text>
        </Box>
      </Box>
    );
  };

  const hasActiveTodo = todoDisplay.activeTodos.length > 0;
  const shouldShowProcessing = !hasActiveTodo && isActive && message;

  return (
    <Box flexDirection='column' marginTop={1}>
      {shouldShowProcessing ? renderProcessingStatus() : renderTodoStatus()}
    </Box>
  );
};
