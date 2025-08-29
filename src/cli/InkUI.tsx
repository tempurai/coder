import React, { useState, useEffect, useCallback } from 'react';
import { render, Text, Box, Static, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { SimpleAgent, AgentStreamEvent } from '../agents/SimpleAgent';
import { ConfigLoader } from '../config/ConfigLoader';
import { UserMessage } from './components/UserMessage';
import { AssistantMessage } from './components/AssistantMessage';
import { ToolCall } from './components/ToolCall';
import { SystemMessage } from './components/SystemMessage';

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
export type HistoryItem =
  | UserMessageItem
  | AssistantMessageItem
  | ToolCallGroupItem
  | SystemInfoItem
  | ErrorItem;

interface CodeAssistantAppProps {
  agent: SimpleAgent;
}

const CodeAssistantApp: React.FC<CodeAssistantAppProps> = ({ agent }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [streamingResponse, setStreamingResponse] = useState<string>('');

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

  // 处理用户提交
  const handleSubmit = useCallback(async (userInput: string) => {
    if (!userInput.trim() || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setStreamingResponse('');
    
    // 添加用户消息到历史
    const userMessage: UserMessageItem = {
      id: generateId(),
      type: 'userMessage',
      content: userInput.trim(),
      timestamp: new Date()
    };
    
    setHistory(prev => [...prev, userMessage]);
    setInput('');

    try {
      let currentToolCallGroup: ToolCallGroupItem | null = null;
      let currentStreamingText = '';

      // 处理流式事件
      for await (const event of agent.processStream(userInput)) {
        switch (event.type) {
          case 'text-chunk':
            currentStreamingText = event.content;
            setStreamingResponse(currentStreamingText);
            break;

          case 'tool-call':
            // 如果没有当前工具调用组，创建一个新的
            if (!currentToolCallGroup) {
              currentToolCallGroup = {
                id: generateId(),
                type: 'toolCallGroup',
                timestamp: new Date(),
                calls: []
              };
              setHistory(prev => [...prev, currentToolCallGroup!]);
            }

            // 添加新的工具调用
            const newToolCall: IndividualToolCall = {
              id: generateId(),
              toolName: event.toolName,
              toolInput: event.toolInput,
              status: 'executing'
            };

            currentToolCallGroup.calls.push(newToolCall);
            
            // 更新历史记录中的工具调用组
            setHistory(prev => prev.map(item => 
              item.id === currentToolCallGroup!.id ? { ...currentToolCallGroup! } : item
            ));
            break;

          case 'tool-result':
            // 找到对应的工具调用并更新结果
            if (currentToolCallGroup) {
              const targetCall = currentToolCallGroup.calls.find(call => 
                call.toolName === event.toolName && call.status === 'executing'
              );
              
              if (targetCall) {
                targetCall.status = 'success';
                targetCall.result = event.result;
                
                // 更新历史记录
                setHistory(prev => prev.map(item => 
                  item.id === currentToolCallGroup!.id ? { ...currentToolCallGroup! } : item
                ));
              }
            }
            break;

          case 'error':
            // 创建错误项
            const errorItem: ErrorItem = {
              id: generateId(),
              type: 'error',
              content: event.content,
              timestamp: new Date()
            };
            
            setHistory(prev => [...prev, errorItem]);
            
            // 如果有正在执行的工具调用，标记为失败
            if (currentToolCallGroup) {
              const executingCall = currentToolCallGroup.calls.find(call => call.status === 'executing');
              if (executingCall) {
                executingCall.status = 'error';
                executingCall.error = event.content;
                
                setHistory(prev => prev.map(item => 
                  item.id === currentToolCallGroup!.id ? { ...currentToolCallGroup! } : item
                ));
              }
            }
            break;
        }
      }

      // 如果有流式文本响应，将其添加为助手消息
      if (currentStreamingText.trim()) {
        const assistantMessage: AssistantMessageItem = {
          id: generateId(),
          type: 'assistantMessage',
          content: currentStreamingText,
          timestamp: new Date()
        };
        
        setHistory(prev => [...prev, assistantMessage]);
      }

    } catch (error) {
      // 创建错误消息
      const errorItem: ErrorItem = {
        id: generateId(),
        type: 'error',
        content: `处理请求时出错: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: new Date()
      };
      
      setHistory(prev => [...prev, errorItem]);
    } finally {
      setIsProcessing(false);
      setStreamingResponse('');
    }
  }, [agent, isProcessing, generateId]);

  return (
    <Box flexDirection="column">
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ✨ Tempurai Code Assistant
        </Text>
      </Box>

      {/* 历史记录 */}
      <Static items={history}>
        {renderHistoryItem}
      </Static>

      {/* 流式响应显示 */}
      {streamingResponse && (
        <Box marginY={1}>
          <Box>
            <Text color="blue" bold>
              🤖 Assistant:
            </Text>
          </Box>
          <Box marginLeft={2} marginTop={1}>
            <Text color="white">{streamingResponse}</Text>
          </Box>
        </Box>
      )}

      {/* 输入区域 */}
      <Box marginTop={1}>
        <Text color="green" bold>
          {isProcessing ? '⏳ 处理中... ' : '> '}
        </Text>
        {!isProcessing && (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="输入您的问题或命令..."
          />
        )}
      </Box>

      {/* 帮助信息 */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          输入问题回车发送 • Ctrl+C 退出
        </Text>
      </Box>
    </Box>
  );
};

// 启动函数
export const startInkUI = async () => {
  const configLoader = new ConfigLoader();
  const config = configLoader.getConfig();
  
  // 验证配置
  const validation = configLoader.validateConfig();
  if (!validation.isValid) {
    console.error('❌ 配置验证失败:');
    validation.errors.forEach(error => console.error(`   - ${error}`));
    process.exit(1);
  }

  // 创建语言模型实例
  const model = await configLoader.createLanguageModel();
  const agent = new SimpleAgent(config, model, config.customContext);
  
  render(<CodeAssistantApp agent={agent} />);
};

// 如果直接运行此文件则启动
if (require.main === module) {
  startInkUI().catch(error => {
    console.error('❌ Failed to start Ink UI:', error);
    process.exit(1);
  });
}