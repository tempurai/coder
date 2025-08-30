import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';
import { UIEvent, TaskStartedEvent, TaskCompletedEvent, GitBranchCreatedEvent } from '../../events/index.js';

interface TaskState {
  isActive: boolean;
  description: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  success?: boolean;
  gitBranch?: string;
  workingDirectory: string;
}

interface TaskContainerProps {
  events: UIEvent[];
  children: React.ReactNode;
}

export const TaskContainer: React.FC<TaskContainerProps> = ({ events, children }) => {
  const { currentTheme } = useTheme();
  const [taskState, setTaskState] = useState<TaskState>({
    isActive: false,
    description: '',
    workingDirectory: process.cwd(),
  });

  // Process events to update task state
  useEffect(() => {
    const latestEvents = events.slice(-10); // Process recent events
    
    for (const event of latestEvents) {
      switch (event.type) {
        case 'task_started':
          const startedEvent = event as TaskStartedEvent;
          setTaskState(prev => ({
            ...prev,
            isActive: true,
            description: startedEvent.description,
            startTime: startedEvent.timestamp,
            workingDirectory: startedEvent.workingDirectory,
            endTime: undefined,
            duration: undefined,
            success: undefined,
          }));
          break;
          
        case 'task_completed':
          const completedEvent = event as TaskCompletedEvent;
          setTaskState(prev => ({
            ...prev,
            isActive: false,
            endTime: completedEvent.timestamp,
            duration: completedEvent.duration,
            success: completedEvent.success,
          }));
          break;
          
        case 'git_branch_created':
          const gitEvent = event as GitBranchCreatedEvent;
          setTaskState(prev => ({
            ...prev,
            gitBranch: gitEvent.branchName,
          }));
          break;
      }
    }
  }, [events]);

  const getStatusIndicator = () => {
    if (!taskState.isActive && taskState.success === undefined) {
      return { symbol: '⚡', color: currentTheme.colors.ui.highlight };
    }
    if (taskState.isActive) {
      return { symbol: '🔄', color: currentTheme.colors.info };
    }
    if (taskState.success) {
      return { symbol: '✅', color: currentTheme.colors.success };
    }
    return { symbol: '❌', color: currentTheme.colors.error };
  };

  const status = getStatusIndicator();

  return (
    <Box flexDirection="column">
      {/* Task Header */}
      <Box marginBottom={1} paddingX={1} borderStyle="round" borderColor={currentTheme.colors.ui.border}>
        <Box>
          <Text color={status.color}>{status.symbol} </Text>
          <Text color={currentTheme.colors.primary} bold>
            Tempurai Code Assistant
          </Text>
        </Box>
        
        {taskState.description && (
          <Box marginTop={1}>
            <Text color={currentTheme.colors.text.secondary}>
              Task: {taskState.description}
            </Text>
            {taskState.gitBranch && (
              <Text color={currentTheme.colors.tools.git}>
                {' '}• Branch: {taskState.gitBranch}
              </Text>
            )}
          </Box>
        )}
      </Box>
      
      {/* Task Content */}
      {children}
    </Box>
  );
};