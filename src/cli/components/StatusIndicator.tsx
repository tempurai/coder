import React from 'react';
import { Text } from 'ink';
import { useTheme } from '../themes/index.js';

export type IndicatorType = 'user' | 'assistant' | 'tool' | 'error' | 'system';

interface StatusIndicatorProps {
  type: IndicatorType;
  isActive?: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ type, isActive = false }) => {
  const { currentTheme } = useTheme();

  const getIndicatorProps = () => {
    switch (type) {
      case 'user':
        return {
          symbol: '▶',
          color: currentTheme.colors.text.primary,
        };
      case 'assistant':
        return {
          symbol: '●',
          color: currentTheme.colors.info,
        };
      case 'tool':
        return {
          symbol: '●',
          color: isActive ? currentTheme.colors.warning : currentTheme.colors.success,
        };
      case 'error':
        return {
          symbol: '●',
          color: currentTheme.colors.error,
        };
      case 'system':
        return {
          symbol: '●',
          color: currentTheme.colors.text.muted,
        };
      default:
        return {
          symbol: '●',
          color: currentTheme.colors.text.muted,
        };
    }
  };

  const { symbol, color } = getIndicatorProps();

  return <Text color={color}>{symbol}</Text>;
};
