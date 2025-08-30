import React, { useState, useEffect, useCallback } from 'react';
import { render, Text, Box, Static, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { SimpleAgent, AgentStreamEvent } from '../agents/SimpleAgent.js';
import { SessionService, TaskExecutionResult } from '../session/SessionService.js';
import { UserMessage } from './components/UserMessage.js';
import { AssistantMessage } from './components/AssistantMessage.js';
import { ToolCall } from './components/ToolCall.js';
import { SystemMessage } from './components/SystemMessage.js';

// 所有历史记录项的通用基础
interface BaseHistoryItem {
  id: string; // 使用 UUID 或时间戳+随机数确保唯一
  timestamp: Date;
}

// 用户输入的消息
export interface UserMessageItem extends BaseHistoryItem {
  type: 'userMessage';
  content: string;
}

// 助手的文本回复
export interface AssistantMessageItem extends BaseHistoryItem {
  type: 'assistantMessage';
  content: string;
}

// 表示一个或多个工具调用的组合
export interface ToolCallGroupItem extends BaseHistoryItem {
  type: 'toolCallGroup';
  calls: IndividualToolCall[];
}

// 单个工具调用的详细信息
export interface IndividualToolCall {
  id: string; // 工具调用的唯一ID
  toolName: string;
  toolInput: Record<string, any>;
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: any; // 工具成功执行后的返回结果
  error?: string; // 工具执行失败时的错误信息
}

// 系统信息，用于通知用户（如 "历史已清除")
export interface SystemInfoItem extends BaseHistoryItem {
  type: 'systemInfo';
  content: string;
}

// 系统错误，用于显示严重错误
export interface ErrorItem extends BaseHistoryItem {
  type: 'error';
  content: string;
}

// 所有可能历史项的联合类型
export type HistoryItem = UserMessageItem | AssistantMessageItem | ToolCallGroupItem | SystemInfoItem | ErrorItem;

interface CodeAssistantAppProps {
  sessionService: SessionService;
  agent?: SimpleAgent; // 保持向后兼容，但推荐使用sessionService
}

const CodeAssistantApp: React.FC<CodeAssistantAppProps> = ({ sessionService, agent }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [streamingResponse, setStreamingResponse] = useState<string>('');

  // 使用sessionService或fallback到agent (向后兼容)
  const actualAgent = agent || sessionService.agent;

  // 生成唯一 ID 的辅助函数
  const generateId = useCallback((): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // 处理键盘输入
  useInput((input: string, key: any) => {
    if (key.ctrl && input === 'c') {
      process.exit(0);
    }
  });

  // 渲染历史记录项的辅助函数
  const renderHistoryItem = useCallback((item: HistoryItem) => {
    switch (item.type) {
      case 'userMessage':
        return <UserMessage key={item.id} item={item} />;
      case 'assistantMessage':
        return <AssistantMessage key={item.id} item={item} />;
      case 'toolCallGroup':
        return <ToolCall key={item.id} item={item} />;
      case 'systemInfo':
      case 'error':
        return <SystemMessage key={item.id} item={item} />;
      default:
        return null;
    }
  }, []);

  // 处理特殊命令
  const handleSpecialCommands = useCallback(
    (input: string): boolean => {
      const command = input.toLowerCase();

      if (['/help', 'help'].includes(command)) {
        const helpItem: SystemInfoItem = {
          id: generateId(),
          type: 'systemInfo',
          content: '🔧 可用命令:\n/help - 显示帮助\n/status - 显示状态\n/session - 显示会话统计\n/clear - 清除历史\n/exit - 退出应用',
          timestamp: new Date(),
        };
        setHistory((prev) => [...prev, helpItem]);
        return true;
      }

      if (['/status', 'status'].includes(command)) {
        const stats = sessionService.getSessionStats();
        const statusItem: SystemInfoItem = {
          id: generateId(),
          type: 'systemInfo',
          content: `📊 当前状态:\n交互次数: ${stats.totalInteractions}\n平均响应时间: ${stats.averageResponseTime}ms\n已访问文件: ${stats.uniqueFilesAccessed}\n会话时长: ${stats.sessionDuration}s`,
          timestamp: new Date(),
        };
        setHistory((prev) => [...prev, statusItem]);
        return true;
      }

      if (['/session', 'session'].includes(command)) {
        const stats = sessionService.getSessionStats();
        const fileWatcherStats = sessionService.getFileWatcherStats();
        const sessionItem: SystemInfoItem = {
          id: generateId(),
          type: 'systemInfo',
          content: `📈 会话统计:\n总交互: ${stats.totalInteractions}\nToken使用: ${stats.totalTokensUsed}\n监听文件: ${fileWatcherStats.watchedFileCount}\n文件变更: ${fileWatcherStats.recentChangesCount}`,
          timestamp: new Date(),
        };
        setHistory((prev) => [...prev, sessionItem]);
        return true;
      }

      if (['/clear', 'clear'].includes(command)) {
        setHistory([]);
        sessionService.clearSession();
        const clearItem: SystemInfoItem = {
          id: generateId(),
          type: 'systemInfo',
          content: '✨ 历史记录和会话状态已清除',
          timestamp: new Date(),
        };
        setHistory((prev) => [...prev, clearItem]);
        return true;
      }

      if (['/exit', 'exit', 'quit'].includes(command)) {
        process.exit(0);
      }

      return false;
    },
    [sessionService, generateId],
  );

  // 处理用户提交
  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (!userInput.trim() || isProcessing) {
        return;
      }

      // 处理特殊命令
      if (handleSpecialCommands(userInput)) {
        return;
      }

      setIsProcessing(true);
      setStreamingResponse('');

      // 添加用户消息到历史
      const userMessage: UserMessageItem = {
        id: generateId(),
        type: 'userMessage',
        content: userInput.trim(),
        timestamp: new Date(),
      };

      setHistory((prev) => [...prev, userMessage]);
      setInput('');

      try {
        // 使用SessionService的新任务处理架构
        const result: TaskExecutionResult = await sessionService.processTask(userInput);

        // 显示任务执行结果
        const resultMessage: AssistantMessageItem = {
          id: generateId(),
          type: 'assistantMessage',
          content: `✅ 任务${result.success ? '完成' : '失败'}
      📝 ${result.summary}
      ⏱️ 执行时间: ${result.duration}ms
      🔄 迭代: ${result.iterations}次${
        result.diff
          ? `
      📁 文件变更: ${result.diff.filesChanged}个`
          : ''
      }${
        result.error
          ? `
      ❌ 错误: ${result.error}`
          : ''
      }`,
          timestamp: new Date(),
        };

        setHistory((prev) => [...prev, resultMessage]);
      } catch (error) {
        // Fallback到原始流式处理模式
        console.warn('⚠️ SessionService模式失败，回退到流式模式');

        // 创建错误消息
        const errorItem: ErrorItem = {
          id: generateId(),
          type: 'error',
          content: `任务处理失败: ${error instanceof Error ? error.message : '未知错误'}`,
          timestamp: new Date(),
        };

        setHistory((prev) => [...prev, errorItem]);
      } finally {
        setIsProcessing(false);
        setStreamingResponse('');
      }
    },
    [sessionService, actualAgent, isProcessing, generateId, handleSpecialCommands],
  );

  return (
    <Box flexDirection='column'>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text color='cyan' bold>
          ✨ Tempurai Code Assistant
        </Text>
      </Box>

      {/* 历史记录 */}
      <Static items={history}>{renderHistoryItem}</Static>

      {/* 流式响应显示 */}
      {streamingResponse && (
        <Box marginY={1}>
          <Box>
            <Text color='blue' bold>
              🤖 Assistant:
            </Text>
          </Box>
          <Box marginLeft={2} marginTop={1}>
            <Text color='white'>{streamingResponse}</Text>
          </Box>
        </Box>
      )}

      {/* 输入区域 */}
      <Box marginTop={1}>
        <Text color='green' bold>
          {isProcessing ? '⏳ 处理中... ' : '> '}
        </Text>
        {!isProcessing && <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder='输入您的问题或命令...' />}
      </Box>

      {/* 帮助信息 */}
      <Box marginTop={1}>
        <Text color='gray' dimColor>
          输入问题回车发送 • /help 查看命令 • Ctrl+C 退出
        </Text>
      </Box>
    </Box>
  );
};

// 新的启动函数 - 使用SessionService（推荐）
export const startEnhancedInkUI = async (sessionService: SessionService) => {
  console.log('🎨 启动增强版 InkUI 界面...');
  render(<CodeAssistantApp sessionService={sessionService} />);
};
