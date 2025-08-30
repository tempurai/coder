import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useTheme } from '../themes/index.js';

interface ProgressIndicatorProps {
  phase: string;
  message: string;
  progress?: number;
  isActive?: boolean;
  showSpinner?: boolean;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  phase,
  message,
  progress,
  isActive = true,
  showSpinner = true,
}) => {
  const { currentTheme } = useTheme();
  
  const getPhaseIcon = (phase: string) => {
    switch (phase.toLowerCase()) {
      case 'searching': case 'finding': return '🔍';
      case 'reading': case 'loading': return '📖';
      case 'writing': case 'saving': return '💾';
      case 'executing': case 'running': return '⚡';
      case 'analyzing': case 'processing': return '🔬';
      case 'connecting': case 'fetching': return '🌐';
      case 'completed': case 'done': return '✅';
      case 'failed': case 'error': return '❌';
      default: return '📋';
    }
  };

  const phaseIcon = getPhaseIcon(phase);
  const showProgress = typeof progress === 'number' && progress >= 0 && progress <= 100;

  return (
    <Box>
      {isActive && showSpinner ? (
        <Text color={currentTheme.colors.info}>
          <Spinner type="dots" />
        </Text>
      ) : (
        <Text>{phaseIcon}</Text>
      )}
      
      <Box marginLeft={1}>
        <Text color={currentTheme.colors.text.primary}>
          {message}
          {showProgress && <Text color={currentTheme.colors.text.muted}> ({progress}%)</Text>}
        </Text>
      </Box>
    </Box>
  );
};