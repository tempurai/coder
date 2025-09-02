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

const TIPS = ['Tip: Use : to select execution mode', 'Tip: Use /help for available commands', 'Tip: Use Shift+Tab to cycle edit mode', 'Tip: Press Ctrl+C twice to exit', 'Tip: AI can make mistakes, please check output carefully'];

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

  // Show errors if they exist
  if (errorState && errorState.errors.length > 0) {
    return (
      <Box flexDirection='column'>
        {errorState.errors.map((error, index) => (
          <Box key={index}>
            <Text color={currentTheme.colors.error}>!</Text>
            <Box marginLeft={1}>
              <Text color={currentTheme.colors.error}>{error}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  // Show todo state if available
  if (todoState && (todoState.current || todoState.next)) {
    return (
      <Box flexDirection='column'>
        {todoState.current && (
          <Box>
            <Text color={currentTheme.colors.accent}>⏵</Text>
            <Box marginLeft={1}>
              <Text color={currentTheme.colors.accent}>Current: {todoState.current.title}</Text>
            </Box>
          </Box>
        )}
        {todoState.next && (
          <Box>
            <Text color={currentTheme.colors.text.muted}>◦</Text>
            <Box marginLeft={1}>
              <Text color={currentTheme.colors.text.muted}>Next: {todoState.next.title}</Text>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  // Show main progress
  if (isActive && message) {
    return (
      <Box>
        {isActive && showSpinner ? (
          <Text color={currentTheme.colors.info}>
            <Spinner type='dots' />
          </Text>
        ) : (
          <Text color={currentTheme.colors.semantic.indicator}>{phaseSymbol}</Text>
        )}
        <Box marginLeft={1}>
          <Text color={currentTheme.colors.semantic.result}>
            {message}
            {showProgress && <Text color={currentTheme.colors.semantic.metadata}> ({progress}%)</Text>}
          </Text>
        </Box>
      </Box>
    );
  }

  // Show random tip when idle
  const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];
  return (
    <Box>
      <Text color={currentTheme.colors.text.muted}>💡</Text>
      <Box marginLeft={1}>
        <Text color={currentTheme.colors.text.muted}>{randomTip}</Text>
      </Box>
    </Box>
  );
};
