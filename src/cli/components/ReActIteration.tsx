import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';
import { ThoughtSection } from './ThoughtSection.js';
import { PlanSection } from './PlanSection.js';
import { ActionSection } from './ActionSection.js';

export interface ReActIterationData {
  iteration: number;
  maxIterations: number;
  observation?: string;
  thought?: string;
  plan?: string;
  action?: {
    tool: string;
    args: any;
    result?: any;
    error?: string;
    progress?: Array<{
      phase: string;
      message: string;
      timestamp: Date;
    }>;
  };
  isComplete: boolean;
  isActive: boolean;
}

interface ReActIterationProps {
  data: ReActIterationData;
  showDetails: boolean;
}

export const ReActIteration: React.FC<ReActIterationProps> = ({ data, showDetails }) => {
  const { currentTheme } = useTheme();
  
  const getIterationStatus = () => {
    if (data.isActive) {
      return { symbol: '🔄', color: currentTheme.colors.info, label: 'Processing' };
    }
    if (data.isComplete && data.action?.error) {
      return { symbol: '❌', color: currentTheme.colors.error, label: 'Failed' };
    }
    if (data.isComplete) {
      return { symbol: '✅', color: currentTheme.colors.success, label: 'Completed' };
    }
    return { symbol: '⏳', color: currentTheme.colors.warning, label: 'Pending' };
  };

  const status = getIterationStatus();

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Iteration Header */}
      <Box marginBottom={1}>
        <Text color={status.color}>{status.symbol} </Text>
        <Text color={currentTheme.colors.primary} bold>
          Iteration {data.iteration}/{data.maxIterations}
        </Text>
        <Text color={currentTheme.colors.text.muted}>
          {' '}• {status.label}
        </Text>
        {data.action?.tool && (
          <Text color={currentTheme.colors.tools[data.action.tool as keyof typeof currentTheme.colors.tools] || currentTheme.colors.accent}>
            {' '}• {data.action.tool}
          </Text>
        )}
      </Box>

      {/* Collapsible Details */}
      {showDetails && (
        <Box flexDirection="column" marginLeft={2} borderLeft borderColor={currentTheme.colors.ui.separator}>
          <Box paddingLeft={2}>
            {/* Observation (if available) */}
            {data.observation && (
              <Box marginBottom={1}>
                <Text color={currentTheme.colors.react.observation} bold>
                  📋 Observation:
                </Text>
                <Box marginTop={1} marginLeft={2}>
                  <Text color={currentTheme.colors.text.primary}>
                    {data.observation}
                  </Text>
                </Box>
              </Box>
            )}

            {/* Thought Section */}
            {data.thought && (
              <ThoughtSection 
                thought={data.thought} 
                iteration={data.iteration}
              />
            )}

            {/* Plan Section */}
            {data.plan && (
              <PlanSection 
                plan={data.plan} 
                iteration={data.iteration}
              />
            )}

            {/* Action Section */}
            {data.action && (
              <ActionSection 
                action={data.action}
                iteration={data.iteration}
              />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};