import React from 'react';
import { Text, Box } from 'ink';
import Spinner from 'ink-spinner';
import { ToolCallGroupItem, IndividualToolCall } from '../InkUI';

interface ToolCallProps {
  item: ToolCallGroupItem;
}

interface IndividualToolCallProps {
  call: IndividualToolCall;
}

const IndividualToolCallComponent: React.FC<IndividualToolCallProps> = ({ call }) => {
  const renderStatus = () => {
    switch (call.status) {
      case 'pending':
        return (
          <Box>
            <Text color="gray" dimColor>
              ⏳ 计划中...
            </Text>
          </Box>
        );
      case 'executing':
        return (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text color="yellow" marginLeft={1}>
              执行中...
            </Text>
          </Box>
        );
      case 'success':
        return (
          <Box flexDirection="column">
            <Box>
              <Text color="green" bold>
                ✓ 成功
              </Text>
            </Box>
            {call.result && (
              <Box marginLeft={2} marginTop={1}>
                <Text color="white">
                  {typeof call.result === 'string' 
                    ? call.result 
                    : JSON.stringify(call.result, null, 2)
                  }
                </Text>
              </Box>
            )}
          </Box>
        );
      case 'error':
        return (
          <Box flexDirection="column">
            <Box>
              <Text color="red" bold>
                ✗ 失败
              </Text>
            </Box>
            {call.error && (
              <Box marginLeft={2} marginTop={1}>
                <Text color="red">
                  {call.error}
                </Text>
              </Box>
            )}
          </Box>
        );
      default:
        return null;
    }
  };

  const formatToolInput = (input: Record<string, any>): string => {
    if (!input || Object.keys(input).length === 0) {
      return '';
    }
    
    // 尝试格式化为易读的字符串
    const entries = Object.entries(input);
    if (entries.length === 1 && typeof entries[0][1] === 'string') {
      return entries[0][1];
    }
    
    return JSON.stringify(input, null, 2);
  };

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      <Box>
        <Text color="cyan" bold>
          🛠️  {call.toolName}
        </Text>
        <Text color="gray" marginLeft={1}>
          (ID: {call.id.substring(0, 8)}...)
        </Text>
      </Box>
      
      {call.toolInput && Object.keys(call.toolInput).length > 0 && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="gray" dimColor>
            参数: {formatToolInput(call.toolInput)}
          </Text>
        </Box>
      )}
      
      <Box marginLeft={2} marginTop={1}>
        {renderStatus()}
      </Box>
    </Box>
  );
};

export const ToolCall: React.FC<ToolCallProps> = ({ item }) => {
  return (
    <Box marginY={1} flexDirection="column">
      <Box>
        <Text color="magenta" bold>
          🔧 工具调用
        </Text>
      </Box>
      
      {item.calls.map((call, index) => (
        <IndividualToolCallComponent key={call.id || index} call={call} />
      ))}
      
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {item.timestamp.toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
};