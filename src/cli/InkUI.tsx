import React, { useState, useEffect, useCallback } from 'react';
import { render, Text, Box, useInput } from 'ink';
import { SessionService } from '../services/SessionService.js';
import { ThemeName, ThemeProvider, useTheme } from './themes/index.js';
import { TaskContainer } from './components/TaskContainer.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ThemeSelector } from './components/ThemeSelector.js';
import { DynamicInput } from './components/DynamicInput.js';
import { useSessionEvents } from './hooks/useSessionEvents.js'; // <-- IMPORT THE NEW HOOK

type AppState = 'welcome' | 'theme-selection' | 'ready';

interface CodeAssistantAppProps {
  sessionService: SessionService;
}

const CodeAssistantAppCore: React.FC<CodeAssistantAppProps> = ({ sessionService }) => {
  const { currentTheme, setTheme, availableThemes, themeName } = useTheme();
  const [appState, setAppState] = useState<AppState>('welcome');
  const [input, setInput] = useState<string>('');
  const [detailMode, setDetailMode] = useState<boolean>(false);
  const [ctrlCCount, setCtrlCCount] = useState<number>(0);

  // Use the new hook as the single source of truth for event-driven state
  const { events, isProcessing, pendingConfirmation, currentActivity, handleConfirmation } = useSessionEvents(sessionService);

  const mask = (val?: string) => (val ? `${val.slice(0, 6)}…${val.slice(-4)}` : 'not set');

  useEffect(() => {
    if (ctrlCCount > 0) {
      const timer = setTimeout(() => setCtrlCCount(0), 2000);
      return () => clearTimeout(timer);
    }
  }, [ctrlCCount]);

  useInput((inputChar: string, key: any) => {
    if (key.ctrl && inputChar === 'c') {
      if (input.length > 0) {
        setInput('');
        setCtrlCCount(0);
      } else {
        setCtrlCCount((prev) => prev + 1);
        if (ctrlCCount >= 1) {
          sessionService.interrupt();
          process.exit(0);
        }
      }
      return;
    }
    if (key.escape) {
      if (isProcessing) sessionService.interrupt();
      return;
    }
    if (key.ctrl && inputChar === 'r') {
      setDetailMode((prev) => !prev);
      return;
    }
    if (appState === 'welcome') {
      setAppState('theme-selection');
      return;
    }
    if (appState !== 'ready' || pendingConfirmation) return;
    if (key.ctrl && inputChar === 't') {
      const currentIndex = availableThemes.indexOf(themeName);
      const nextIndex = (currentIndex + 1) % availableThemes.length;
      setTheme(availableThemes[nextIndex]);
    }
  });

  const handleWelcomeDismiss = useCallback(() => setAppState('theme-selection'), []);
  const handleThemeSelected = useCallback(() => setAppState('ready'), []);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (!userInput.trim() || isProcessing || pendingConfirmation) return;
      setInput('');
      await sessionService.processTask(userInput);
    },
    [sessionService, isProcessing, pendingConfirmation],
  );

  if (appState === 'welcome') return <WelcomeScreen onDismiss={handleWelcomeDismiss} />;
  if (appState === 'theme-selection') return <ThemeSelector onThemeSelected={handleThemeSelected} />;

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

      {/* Pass state down as props */}
      <TaskContainer events={events} isProcessing={isProcessing} currentActivity={currentActivity} detailMode={detailMode} />

      <Box marginTop={2} borderTop borderColor={currentTheme.colors.ui.border} paddingTop={1}>
        <DynamicInput value={input} onChange={setInput} onSubmit={handleSubmit} isProcessing={isProcessing} confirmationData={pendingConfirmation} onConfirm={handleConfirmation} />
      </Box>
    </Box>
  );
};

const CodeAssistantApp: React.FC<CodeAssistantAppProps> = (props) => (
  <ThemeProvider defaultTheme='dark'>
    <CodeAssistantAppCore {...props} />
  </ThemeProvider>
);

export const startInkUI = async (sessionService: SessionService) => {
  console.log('Starting InkUI Interface...');
  const originalConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };
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
