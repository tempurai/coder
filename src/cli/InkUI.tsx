import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { render, Text, Box, useInput } from 'ink';
import { UIEvent, UIEventType, SystemInfoEvent, UserInputEvent } from '../events/index.js';
import { SessionService, TaskExecutionResult } from '../session/SessionService.js';
import { ThemeName, ThemeProvider, useTheme } from './themes/index.js';
import { TaskContainer } from './components/TaskContainer.js';
import { ReActIteration, ReActIterationData } from './components/ReActIteration.js';
import { ProgressIndicator } from './components/ProgressIndicator.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ThemeSelector } from './components/ThemeSelector.js';
import { DynamicInput } from './components/DynamicInput.js';
import { SystemMessage } from './components/SystemMessage.js';
import { UserMessage } from './components/UserMessage.js';

type AppState = 'welcome' | 'theme-selection' | 'ready';

interface CodeAssistantAppProps {
  sessionService: SessionService;
}

const CodeAssistantAppCore: React.FC<CodeAssistantAppProps> = ({ sessionService }) => {
  const { currentTheme, setTheme, availableThemes, themeName } = useTheme();
  const [appState, setAppState] = useState<AppState>('welcome');
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [reactIterations, setReactIterations] = useState<Map<number, ReActIterationData>>(new Map());
  const [input, setInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set());
  const [currentActivity, setCurrentActivity] = useState<string>('');
  const [isFirstRun, setIsFirstRun] = useState(true);

  const generateId = useCallback((): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Utility function to mask sensitive information
  const mask = (val?: string) =>
    val ? `${val.slice(0, 6)}…${val.slice(-4)}` : 'not set';

  // Handle keyboard shortcuts
  useInput((input: string, key: any) => {
    // Always handle exit
    if (key.ctrl && input === 'c') {
      process.exit(0);
    }

    // Welcome screen - any key dismisses
    if (appState === 'welcome') {
      if (isFirstRun) {
        setAppState('theme-selection');
      } else {
        setAppState('ready');
      }
      return;
    }

    // Only handle shortcuts when ready
    if (appState !== 'ready') return;

    if (key.ctrl && input === 't') {
      // Cycle through themes
      const currentIndex = availableThemes.indexOf(themeName);
      const nextIndex = (currentIndex + 1) % availableThemes.length;
      setTheme(availableThemes[nextIndex]);
    }
    if (key.tab) {
      // Toggle all iteration details
      if (expandedIterations.size === reactIterations.size) {
        setExpandedIterations(new Set());
      } else {
        setExpandedIterations(new Set(reactIterations.keys()));
      }
    }
  });

  // Handle welcome screen dismissal
  const handleWelcomeDismiss = useCallback(() => {
    if (isFirstRun) {
      setAppState('theme-selection');
    } else {
      setAppState('ready');
    }
  }, [isFirstRun]);

  // Handle theme selection
  const handleThemeSelected = useCallback(() => {
    setAppState('ready');
    // Keep isFirstRun true to show startup info
  }, []);

  // Subscribe to events from SessionService
  useEffect(() => {
    if (appState !== 'ready') return;

    const eventEmitter = sessionService.events;

    const subscription = eventEmitter.onAll((event: UIEvent) => {
      setEvents((prevEvents) => [...prevEvents, event]);

      // Handle specific event types for reactive updates
      if (event.type === UIEventType.ReActIteration) {
        const iterationData = event as any; // TODO: Fix type
        setReactIterations((prev) => {
          const newIterations = new Map(prev);
          newIterations.set(iterationData.iteration, iterationData);
          return newIterations;
        });
      }

      if (event.type === UIEventType.TaskStart) {
        setIsProcessing(true);
        setCurrentActivity('Processing...');
      }

      if (event.type === UIEventType.TaskComplete) {
        setIsProcessing(false);
        setCurrentActivity('');
      }
    });

    return () => subscription.unsubscribe();
  }, [sessionService, appState]);

  // Handle special commands
  const handleSpecialCommands = useCallback(
    (input: string): boolean => {
      const command = input.toLowerCase();

      if (['/help', 'help'].includes(command)) {
        const helpEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'info',
          message: '🔧 Available Commands:\n/help - Show help\n/status - Show status\n/session - Show session stats\n/clear - Clear history\n/theme [name] - Change theme\n/exit - Exit application',
        };
        setEvents((prev) => [...prev, helpEvent]);
        return true;
      }

      if (['/status', 'status'].includes(command)) {
        const stats = sessionService.getSessionStats();
        const statusEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'info',
          message: `📊 Current Status:\nInteractions: ${stats.totalInteractions}\nAverage Response: ${stats.averageResponseTime}ms\nFiles Accessed: ${stats.uniqueFilesAccessed}\nSession Duration: ${stats.sessionDuration}s`,
        };
        setEvents((prev) => [...prev, statusEvent]);
        return true;
      }

      if (['/session', 'session'].includes(command)) {
        const stats = sessionService.getSessionStats();
        const fileWatcherStats = sessionService.getFileWatcherStats();
        const sessionEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'info',
          message: `📈 Session Statistics:\nTotal Interactions: ${stats.totalInteractions}\nTokens Used: ${stats.totalTokensUsed}\nWatched Files: ${fileWatcherStats.watchedFileCount}\nFile Changes: ${fileWatcherStats.recentChangesCount}`,
        };
        setEvents((prev) => [...prev, sessionEvent]);
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
              message: `🎨 Theme changed to: ${themeName}`,
            };
            setEvents((prev) => [...prev, themeEvent]);
          } else {
            const errorEvent: SystemInfoEvent = {
              id: generateId(),
              type: UIEventType.SystemInfo,
              timestamp: new Date(),
              level: 'error',
              message: `❌ Unknown theme: ${themeName}. Available: ${availableThemes.join(', ')}`,
            };
            setEvents((prev) => [...prev, errorEvent]);
          }
        } else {
          const themeListEvent: SystemInfoEvent = {
            id: generateId(),
            type: UIEventType.SystemInfo,
            timestamp: new Date(),
            level: 'info',
            message: `🎨 Current theme: ${themeName}\nAvailable themes: ${availableThemes.join(', ')}`,
          };
          setEvents((prev) => [...prev, themeListEvent]);
        }
        return true;
      }

      if (['/clear', 'clear'].includes(command)) {
        setEvents([]);
        setReactIterations(new Map());
        sessionService.clearSession();
        const clearEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'info',
          message: '✨ History and session state cleared',
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

  // Handle user submission
  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (!userInput.trim() || isProcessing) {
        return;
      }

      // Hide startup info after first interaction
      if (isFirstRun) {
        setIsFirstRun(false);
      }

      // Handle special commands
      if (handleSpecialCommands(userInput)) {
        setInput('');
        return;
      }

      setIsProcessing(true);
      setInput('');

      // Add user input event
      const userInputEvent: UserInputEvent = {
        id: generateId(),
        type: UIEventType.UserInput,
        timestamp: new Date(),
        input: userInput.trim(),
      };

      setEvents((prev) => [...prev, userInputEvent]);

      try {
        // Process task using SessionService
        const result: TaskExecutionResult = await sessionService.processTask(userInput);

        // The task execution will emit various events through the event system
        // which will be captured by our event subscription
      } catch (error) {
        console.error('Task processing error:', error);

        const errorEvent: SystemInfoEvent = {
          id: generateId(),
          type: UIEventType.SystemInfo,
          timestamp: new Date(),
          level: 'error',
          message: `❌ Task failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };

        setEvents((prev) => [...prev, errorEvent]);
      } finally {
        setIsProcessing(false);
      }
    },
    [sessionService, isProcessing, generateId, handleSpecialCommands],
  );

  // Compute display data
  const displayData = useMemo(() => {
    const totalEvents = events.length;
    const recentEvents = events.slice(-10);

    return {
      totalEvents,
      recentEvents,
    };
  }, [events]);

  // Show welcome screen
  if (appState === 'welcome') {
    return <WelcomeScreen onDismiss={handleWelcomeDismiss} />;
  }

  // Show theme selector
  if (appState === 'theme-selection') {
    return <ThemeSelector onThemeSelected={handleThemeSelected} />;
  }

  // Main application interface
  return (
    <Box flexDirection='column'>
      <TaskContainer events={events}>
        {/* Startup info - show on first run */}
        {isFirstRun && (
          <Box marginY={1} padding={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
            <Text color={currentTheme.colors.info}>• Welcome!</Text>
            <Text></Text>
            <Text>  Type /help for help, /status for your current setup</Text>
            <Text></Text>
            <Text color={currentTheme.colors.text.muted}>cwd: {process.cwd()}</Text>
            <Text></Text>
            <Text>  Overrides (via env):</Text>
            <Text></Text>
            <Text color={currentTheme.colors.text.muted}>  • API Key: {mask(process.env.API_KEY || process.env.OPENAI_API_KEY)}</Text>
            <Text color={currentTheme.colors.text.muted}>  • API Base URL: {process.env.API_BASE_URL || process.env.OPENAI_BASE_URL || 'not set'}</Text>
          </Box>
        )}
        
        {/* Current Activity Indicator */}
        {isProcessing && (
          <Box marginY={1}>
            <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} />
          </Box>
        )}

        {/* ReAct Iterations Display */}
        {reactIterations.size > 0 && (
          <Box flexDirection='column' marginY={1}>
            {Array.from(reactIterations.entries())
              .sort(([a], [b]) => a - b)
              .map(([iterationNum, data]) => (
                <ReActIteration key={iterationNum} data={data} showDetails={expandedIterations.has(iterationNum)} />
              ))}
          </Box>
        )}
      </TaskContainer>

      {/* Input Section */}
      <Box marginTop={2} borderTop borderColor={currentTheme.colors.ui.border} paddingTop={1}>
        <DynamicInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder='Ask me anything or type ? for help...' isProcessing={isProcessing} />
      </Box>
    </Box>
  );
};

// Wrapped component with theme provider
const CodeAssistantApp: React.FC<CodeAssistantAppProps> = (props) => {
  return (
    <ThemeProvider defaultTheme='dark'>
      <CodeAssistantAppCore {...props} />
    </ThemeProvider>
  );
};

// startup function
export const startInkUI = async (sessionService: SessionService) => {
  console.log('🎨 Starting InkUI Interface...');
  render(<CodeAssistantApp sessionService={sessionService} />);
};
