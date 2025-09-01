import React, { useState, useEffect, useCallback } from 'react';
import { render, Text, Box, useInput, Static } from 'ink';
import { SessionService } from '../services/SessionService.js';
import { ThemeName, ThemeProvider, useTheme } from './themes/index.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ThemeSelector } from './components/ThemeSelector.js';
import { DynamicInput } from './components/DynamicInput.js';
import { useSessionEvents } from './hooks/useSessionEvents.js';
import { useEventSeparation } from './hooks/useEventSeparation.js';
import { EventItem } from './components/EventItem.js';
import { ProgressIndicator } from './components/ProgressIndicator.js';

type AppState = 'welcome' | 'theme-selection' | 'ready';

interface CodeAssistantAppProps {
  sessionService: SessionService;
}

interface MainUIProps {
  sessionService: SessionService;
}

const MainUI: React.FC<MainUIProps> = ({ sessionService }) => {
  const { currentTheme } = useTheme();
  const { events, isProcessing, pendingConfirmation, currentActivity, handleConfirmation, toolExecutions } = useSessionEvents(sessionService);

  // 使用新的事件分离hook
  const { staticEvents, dynamicEvents } = useEventSeparation(events);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (isProcessing || pendingConfirmation) return;
      await sessionService.processTask(userInput);
    },
    [sessionService, isProcessing, pendingConfirmation],
  );

  const staticItems = [
    // Header
    <Box key='header' flexDirection='column' marginBottom={1} paddingX={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
      <Text color={currentTheme.colors.info}>Welcome to Tempurai Code Assistant</Text>
      <Text> </Text>
      <Text>
        Type /help for commands • <Text color={currentTheme.colors.accent}>Ctrl+R</Text> for detail mode
      </Text>
      <Text color={currentTheme.colors.text.muted}>cwd: {process.cwd()}</Text>
      <Text> </Text>
      <Text color={currentTheme.colors.text.muted}>AI can make mistakes, please check output carefully.</Text>
    </Box>,

    // Title
    <Box key='title' marginBottom={1}>
      <Text color={currentTheme.colors.ui.highlight}>{'⚡'} </Text>
      <Text color={currentTheme.colors.primary} bold>
        Tempurai Code Assistant
      </Text>
    </Box>,

    // Static events
    ...staticEvents.map((event, index) => (
      <Box key={event.id || `static-${index}`} marginBottom={0}>
        <EventItem event={event} index={index} />
      </Box>
    )),
  ];

  return (
    <Box flexDirection='column'>
      {/* Static content */}
      <Static items={staticItems}>{(item) => item}</Static>

      {/* Dynamic events */}
      {dynamicEvents.map((event, index) => (
        <Box key={event.id || `dynamic-${index}`} marginBottom={0}>
          <EventItem event={event} index={index} />
        </Box>
      ))}

      {/* Processing indicator */}
      {isProcessing && (
        <Box marginY={1}>
          <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} />
        </Box>
      )}

      {/* Input area */}
      <Box marginTop={1} paddingTop={1}>
        <DynamicInput onSubmit={handleSubmit} isProcessing={isProcessing} confirmationData={pendingConfirmation} onConfirm={handleConfirmation} />
      </Box>
    </Box>
  );
};

const CodeAssistantAppCore: React.FC<CodeAssistantAppProps> = ({ sessionService }) => {
  const { setTheme, availableThemes, themeName } = useTheme();
  const [appState, setAppState] = useState<AppState>('welcome');
  const [ctrlCCount, setCtrlCCount] = useState<number>(0);

  useEffect(() => {
    if (ctrlCCount > 0) {
      const timer = setTimeout(() => setCtrlCCount(0), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [ctrlCCount]);

  useInput((inputChar: string, key: any) => {
    if (key.ctrl && inputChar === 'c') {
      setCtrlCCount((prev) => prev + 1);
      if (ctrlCCount >= 1) {
        sessionService.interrupt();
        process.exit(0);
      }
      return;
    } else {
      setCtrlCCount(0);
    }

    if (key.escape) {
      sessionService.interrupt();
      return;
    }

    // Ctrl+R is reserved for detail mode (not implemented yet)
    if (key.ctrl && inputChar === 'r') {
      // TODO: Toggle detail mode functionality
      return;
    }

    if (appState === 'welcome') {
      setAppState('theme-selection');
      return;
    }

    if (appState === 'ready') {
      if (key.ctrl && inputChar === 't') {
        const currentIndex = availableThemes.indexOf(themeName);
        const nextIndex = (currentIndex + 1) % availableThemes.length;
        setTheme(availableThemes[nextIndex]);
      }
    }
  });

  const handleWelcomeDismiss = useCallback(() => setAppState('theme-selection'), []);
  const handleThemeSelected = useCallback(() => setAppState('ready'), []);

  if (appState === 'welcome') return <WelcomeScreen onDismiss={handleWelcomeDismiss} />;
  if (appState === 'theme-selection') return <ThemeSelector onThemeSelected={handleThemeSelected} />;

  return <MainUI sessionService={sessionService} />;
};

const CodeAssistantApp: React.FC<CodeAssistantAppProps> = (props) => (
  <ThemeProvider defaultTheme='dark'>
    <CodeAssistantAppCore {...props} />
  </ThemeProvider>
);

export const startInkUI = async (sessionService: SessionService) => {
  console.log('Starting InkUI Interface...');

  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  const silentConsole = () => {};
  console.log = silentConsole;
  console.info = silentConsole;
  console.warn = silentConsole;

  const exitFn = () => {
    Object.assign(console, originalConsole);
    sessionService.interrupt();
    process.exit(0);
  };

  process.on('SIGINT', exitFn);
  process.on('SIGTERM', exitFn);

  render(<CodeAssistantApp sessionService={sessionService} />, { patchConsole: false });
};
