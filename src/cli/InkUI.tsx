import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { render, Text, Box, useInput } from 'ink';
import { UIEvent, UIEventType, SystemInfoEvent, UserInputEvent, ToolConfirmationRequestEvent, ToolConfirmationResponseEvent } from '../events/index.js';
import { SessionService, TaskExecutionResult } from '../services/SessionService.js';
import { ThemeName, ThemeProvider, useTheme } from './themes/index.js';
import { TaskContainer } from './components/TaskContainer.js';
import { EventStream } from './components/EventStream.js';
import { ProgressIndicator } from './components/ProgressIndicator.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ThemeSelector } from './components/ThemeSelector.js';
import { DynamicInput } from './components/DynamicInput.js';
import { ConfirmationPanel } from './components/ConfirmationPanel.js';

type AppState = 'welcome' | 'theme-selection' | 'ready';

interface PendingConfirmation {
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
}

interface CodeAssistantAppProps {
  sessionService: SessionService;
}

const CodeAssistantAppCore: React.FC<CodeAssistantAppProps> = ({ sessionService }) => {
  const { currentTheme, setTheme, availableThemes, themeName } = useTheme();
  const [appState, setAppState] = useState<AppState>('welcome');
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [input, setInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentActivity, setCurrentActivity] = useState<string>('');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [detailMode, setDetailMode] = useState<boolean>(false);
  const [ctrlCCount, setCtrlCCount] = useState<number>(0);

  const generateId = useCallback((): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const mask = (val?: string) => (val ? `${val.slice(0, 6)}…${val.slice(-4)}` : 'not set');

  // Reset Ctrl+C counter after timeout
  useEffect(() => {
    if (ctrlCCount > 0) {
      const timer = setTimeout(() => setCtrlCCount(0), 2000);
      return () => clearTimeout(timer);
    }
    return;
  }, [ctrlCCount]);

  useInput((input: string, key: any) => {
    // Handle Ctrl+C
    if (key.ctrl && input === 'c') {
      if (input.length > 0) {
        // First Ctrl+C: clear input
        setInput('');
        setCtrlCCount(0);
      } else {
        setCtrlCCount((prev) => prev + 1);
        if (ctrlCCount >= 1) {
          // Second Ctrl+C: force exit
          process.exit(0);
        }
      }
      return;
    }

    // Handle ESC - interrupt execution
    if (key.escape) {
      if (isProcessing) {
        sessionService.interrupt();
        setIsProcessing(false);
        setCurrentActivity('');
        const interruptEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'info',
          message: 'Execution interrupted by user',
        };
        setEvents((prev) => [...prev, interruptEvent]);
      }
      return;
    }

    // Handle Ctrl+R - toggle detail mode
    if (key.ctrl && input === 'r') {
      setDetailMode((prev) => !prev);
      const modeEvent: SystemInfoEvent = {
        id: generateId(),
        type: UIEventType.SystemInfo,
        timestamp: new Date(),
        level: 'info',
        message: `Detail mode ${!detailMode ? 'enabled' : 'disabled'}`,
      };
      setEvents((prev) => [...prev, modeEvent]);
      return;
    }

    // Welcome screen handling
    if (appState === 'welcome') {
      setAppState('theme-selection');
      return;
    }

    if (appState !== 'ready') return;

    // Handle Ctrl+T - theme toggle
    if (key.ctrl && input === 't') {
      const currentIndex = availableThemes.indexOf(themeName);
      const nextIndex = (currentIndex + 1) % availableThemes.length;
      setTheme(availableThemes[nextIndex]);
    }
  });

  const handleWelcomeDismiss = useCallback(() => {
    setAppState('theme-selection');
  }, []);

  const handleThemeSelected = useCallback(() => {
    setAppState('ready');
  }, []);

  const handleConfirmation = useCallback(
    (confirmationId: string, approved: boolean) => {
      if (pendingConfirmation?.confirmationId === confirmationId) {
        sessionService.events.emit({
          type: 'tool_confirmation_response',
          confirmationId,
          approved,
        } as Omit<ToolConfirmationResponseEvent, 'id' | 'timestamp' | 'sessionId'>);
        setPendingConfirmation(null);
      }
    },
    [pendingConfirmation, sessionService],
  );

  useEffect(() => {
    if (appState !== 'ready') return;

    const eventEmitter = sessionService.events;
    const subscription = eventEmitter.onAll((event: UIEvent) => {
      setEvents((prevEvents) => [...prevEvents, event]);

      if (event.type === UIEventType.TaskStart) {
        setIsProcessing(true);
        setCurrentActivity('Processing...');
      }

      if (event.type === UIEventType.TaskComplete) {
        setIsProcessing(false);
        setCurrentActivity('');
      }

      if (event.type === 'tool_confirmation_request') {
        const confirmEvent = event as ToolConfirmationRequestEvent;
        setPendingConfirmation({
          confirmationId: confirmEvent.confirmationId,
          toolName: confirmEvent.toolName,
          args: confirmEvent.args,
          description: confirmEvent.description,
        });
      }

      if (event.type === 'tool_confirmation_response') {
        const responseEvent = event as ToolConfirmationResponseEvent;
        if (pendingConfirmation?.confirmationId === responseEvent.confirmationId) {
          setPendingConfirmation(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [sessionService, appState, pendingConfirmation]);

  const handleSpecialCommands = useCallback(
    (input: string): boolean => {
      const command = input.toLowerCase();

      if (['/help', 'help'].includes(command)) {
        const helpEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'info',
          message:
            'Available Commands:\n/help - Show help\n/status - Show status\n/session - Show session stats\n/clear - Clear history\n/theme [name] - Change theme\n/exit - Exit application\n\nKeyboard shortcuts:\nESC - Interrupt execution\nCtrl+C - Clear input (twice to exit)\nCtrl+R - Toggle detail mode\nCtrl+T - Change theme',
        };
        setEvents((prev) => [...prev, helpEvent]);
        return true;
      }

      if (['/status', 'status'].includes(command)) {
        (async () => {
          const stats = await sessionService.getSessionStats();
          const statusEvent: SystemInfoEvent = {
            id: generateId(),
            type: UIEventType.SystemInfo,
            timestamp: new Date(),
            level: 'info',
            message: `Current Status:\nInteractions: ${stats.totalInteractions}\nAverage Response: ${stats.averageResponseTime}ms\nFiles Accessed: ${stats.uniqueFilesAccessed}\nSession Duration: ${stats.sessionDuration}s`,
          };
          setEvents((prev) => [...prev, statusEvent]);
        })();
        return true;
      }

      if (['/session', 'session'].includes(command)) {
        (async () => {
          const stats = await sessionService.getSessionStats();
          const fileWatcherStats = sessionService.getFileWatcherStats();
          const sessionEvent: SystemInfoEvent = {
            id: generateId(),
            type: UIEventType.SystemInfo,
            timestamp: new Date(),
            level: 'info',
            message: `Session Statistics:\nTotal Interactions: ${stats.totalInteractions}\nTokens Used: ${stats.totalTokensUsed}\nWatched Files: ${fileWatcherStats.watchedFileCount}\nFile Changes: ${fileWatcherStats.recentChangesCount}`,
          };
          setEvents((prev) => [...prev, sessionEvent]);
        })();
        return true;
      }

      if (command.startsWith('/theme')) {
        const parts = command.split(' ');
        if (parts.length > 1) {
          const themeName = parts[1] as ThemeName;
          if (availableThemes.includes(themeName)) {
            setTheme(themeName);
            const themeEvent: SystemInfoEvent = {
              id: generateId(),
              type: UIEventType.SystemInfo,
              timestamp: new Date(),
              level: 'info',
              message: `Theme changed to: ${themeName}`,
            };
            setEvents((prev) => [...prev, themeEvent]);
          } else {
            const errorEvent: SystemInfoEvent = {
              id: generateId(),
              type: UIEventType.SystemInfo,
              timestamp: new Date(),
              level: 'error',
              message: `Unknown theme: ${themeName}. Available: ${availableThemes.join(', ')}`,
            };
            setEvents((prev) => [...prev, errorEvent]);
          }
        } else {
          const themeListEvent: SystemInfoEvent = {
            id: generateId(),
            type: UIEventType.SystemInfo,
            timestamp: new Date(),
            level: 'info',
            message: `Current theme: ${themeName}\nAvailable themes: ${availableThemes.join(', ')}`,
          };
          setEvents((prev) => [...prev, themeListEvent]);
        }
        return true;
      }

      if (['/clear', 'clear'].includes(command)) {
        setEvents([]);
        sessionService.clearSession();
        const clearEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'info',
          message: 'History and session state cleared',
        };
        setEvents([clearEvent]);
        return true;
      }

      if (['/exit', 'exit', 'quit'].includes(command)) {
        process.exit(0);
      }

      return false;
    },
    [sessionService, generateId, availableThemes, setTheme, themeName],
  );

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (!userInput.trim() || isProcessing || pendingConfirmation) {
        return;
      }

      if (handleSpecialCommands(userInput)) {
        setInput('');
        return;
      }

      setIsProcessing(true);
      setInput('');

      const userInputEvent: UserInputEvent = {
        id: generateId(),
        type: UIEventType.UserInput,
        timestamp: new Date(),
        input: userInput.trim(),
      };

      setEvents((prev) => [...prev, userInputEvent]);

      try {
        const result: TaskExecutionResult = await sessionService.processTask(userInput);
      } catch (error) {
        console.error('Task processing error:', error);
        const errorEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'error',
          message: `Task failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        setEvents((prev) => [...prev, errorEvent]);
      } finally {
        setIsProcessing(false);
      }
    },
    [sessionService, isProcessing, generateId, handleSpecialCommands, pendingConfirmation],
  );

  if (appState === 'welcome') {
    return <WelcomeScreen onDismiss={handleWelcomeDismiss} />;
  }

  if (appState === 'theme-selection') {
    return <ThemeSelector onThemeSelected={handleThemeSelected} />;
  }

  return (
    <Box flexDirection='column'>
      <Box flexDirection='column' marginY={1} paddingX={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
        <Text color={currentTheme.colors.info}>Welcome to Tempurai Code Assistant</Text>
        <Text> </Text>
        <Text>Type /help for help, /status for your current setup</Text>
        <Text color={currentTheme.colors.text.muted}>cwd: {process.cwd()}</Text>
        <Text color={currentTheme.colors.text.muted}>Detail mode: {detailMode ? 'enabled' : 'disabled'} (Ctrl+R to toggle)</Text>
        <Text> </Text>
        <Text>Environment:</Text>
        <Text color={currentTheme.colors.text.muted}>API Key: {mask(process.env.API_KEY || process.env.OPENAI_API_KEY)}</Text>
        <Text color={currentTheme.colors.text.muted}>API Base URL: {process.env.API_BASE_URL || process.env.OPENAI_BASE_URL || 'not set'}</Text>
      </Box>

      {pendingConfirmation && (
        <ConfirmationPanel confirmationId={pendingConfirmation.confirmationId} toolName={pendingConfirmation.toolName} args={pendingConfirmation.args} description={pendingConfirmation.description} onConfirm={handleConfirmation} />
      )}

      <TaskContainer events={events}>
        {isProcessing && (
          <Box marginY={1}>
            <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} />
          </Box>
        )}

        <EventStream events={events} detailMode={detailMode} />
      </TaskContainer>

      <Box marginTop={2} borderTop borderColor={currentTheme.colors.ui.border} paddingTop={1}>
        <DynamicInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder='Ask me anything or type /help for help...' isProcessing={isProcessing || !!pendingConfirmation} />
      </Box>
    </Box>
  );
};

const CodeAssistantApp: React.FC<CodeAssistantAppProps> = (props) => {
  return (
    <ThemeProvider defaultTheme='dark'>
      <CodeAssistantAppCore {...props} />
    </ThemeProvider>
  );
};

export const startInkUI = async (sessionService: SessionService) => {
  console.log('Starting InkUI Interface...');
  render(<CodeAssistantApp sessionService={sessionService} />);
};
