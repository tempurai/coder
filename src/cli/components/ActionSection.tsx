import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useTheme } from '../themes/index.js';

interface ActionData {
  tool: string;
  args: any;
  result?: any;
  error?: string;
  progress?: Array<{
    phase: string;
    message: string;
    timestamp: Date;
  }>;
}

interface ActionSectionProps {
  action: ActionData;
  iteration: number;
}

export const ActionSection: React.FC<ActionSectionProps> = ({ action, iteration }) => {
  const { currentTheme } = useTheme();
  
  const getToolColor = (toolName: string) => {
    const toolColors = currentTheme.colors.tools;
    if (toolName.includes('shell') || toolName.includes('executor')) return toolColors.shell;
    if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write')) return toolColors.file;
    if (toolName.includes('git')) return toolColors.git;
    if (toolName.includes('web') || toolName.includes('search') || toolName.includes('fetch')) return toolColors.web;
    if (toolName.includes('code') || toolName.includes('analyze')) return toolColors.code;
    return currentTheme.colors.accent;
  };
  
  const getToolIcon = (toolName: string) => {
    if (toolName.includes('shell') || toolName.includes('executor')) return '🔧';
    if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write')) return '📄';
    if (toolName.includes('git')) return '🌿';
    if (toolName.includes('web') || toolName.includes('search') || toolName.includes('fetch')) return '🌐';
    if (toolName.includes('code') || toolName.includes('analyze')) return '🔍';
    if (toolName === 'finish') return '🏁';
    return '⚙️';
  };

  const hasResult = action.result !== undefined;
  const hasError = action.error !== undefined;
  const isInProgress = !hasResult && !hasError && action.progress && action.progress.length > 0;
  
  const toolColor = getToolColor(action.tool);
  const toolIcon = getToolIcon(action.tool);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Tool Header */}
      <Box>
        <Text color={toolColor} bold>
          {toolIcon} Action: {action.tool}
        </Text>
        {isInProgress && (
          <Box marginLeft={1}>
            <Text color={currentTheme.colors.warning}>
              <Spinner type="dots" />
            </Text>
          </Box>
        )}
      </Box>
      
      {/* Tool Arguments */}
      {action.args && Object.keys(action.args).length > 0 && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text color={currentTheme.colors.text.muted}>Parameters:</Text>
          <Box marginLeft={2} marginTop={1}>
            <Text color={currentTheme.colors.text.secondary}>
              {JSON.stringify(action.args, null, 2)}
            </Text>
          </Box>
        </Box>
      )}
      
      {/* Progress Updates */}
      {action.progress && action.progress.length > 0 && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text color={currentTheme.colors.text.muted}>Progress:</Text>
          {action.progress.slice(-3).map((progress, index) => (
            <Box key={index} marginLeft={2} marginTop={1}>
              <Text color={currentTheme.colors.info}>
                • {progress.phase}: {progress.message}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      
      {/* Tool Result */}
      {hasResult && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text color={currentTheme.colors.success} bold>✓ Result:</Text>
          <Box marginLeft={2} marginTop={1}>
            <Text color={currentTheme.colors.text.primary}>
              {typeof action.result === 'string' 
                ? action.result 
                : JSON.stringify(action.result, null, 2)
              }
            </Text>
          </Box>
        </Box>
      )}
      
      {/* Tool Error */}
      {hasError && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text color={currentTheme.colors.error} bold>✗ Error:</Text>
          <Box marginLeft={2} marginTop={1}>
            <Text color={currentTheme.colors.error}>
              {action.error}
            </Text>
          </Box>
        </Box>
      )}
      
      {/* No status indicator */}
      {!isInProgress && !hasResult && !hasError && (
        <Text color={currentTheme.colors.text.muted}>Waiting for execution...</Text>
      )}
    </Box>
  );
};