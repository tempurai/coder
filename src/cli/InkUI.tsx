import React, { useState, useEffect, useCallback } from 'react';
import { render, Text, Box, useInput, Static, useApp } from 'ink';
import { SessionService } from '../services/SessionService.js';
import { ThemeName, ThemeProvider, useTheme } from './themes/index.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ThemeSelector, ThemeSelectorWithPreview } from './components/ThemeSelector.js';
import { InputContainer } from './components/InputContainer.js';
import { useSessionEvents } from './hooks/useSessionEvents.js';
import { useEventSeparation } from './hooks/useEventSeparation.js';
import { EventRouter } from './components/events/EventRouter.js';
import { ProgressIndicator } from './components/ProgressIndicator.js';
import { ExecutionMode, getExecutionModeDisplayInfo } from '../services/ExecutionModeManager.js';

type AppState = 'welcome' | 'theme-selection' | 'ready';

interface CodeAssistantAppProps {
  sessionService: SessionService;
}

interface MainUIProps {
  sessionService: SessionService;
  exit: () => void;
}

const MainUI: React.FC<MainUIProps> = ({ sessionService, exit }) => {
  const { currentTheme } = useTheme();
  const { cliEvents, isProcessing, pendingConfirmation, currentActivity, handleConfirmation } = useSessionEvents(sessionService);
  const { staticEvents, dynamicEvents } = useEventSeparation(cliEvents);
  const [editModeStatus, setEditModeStatus] = useState<string>('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(ExecutionMode.CODE);

  useEffect(() => {
    const updateStatus = () => {
      setEditModeStatus(sessionService.editModeManager.getStatusMessage());
    };
    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, [sessionService]);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (isProcessing || pendingConfirmation) return;
      await sessionService.processTask(userInput, executionMode);
    },
    [sessionService, isProcessing, pendingConfirmation, executionMode],
  );

  const handleEditModeToggle = useCallback(() => {
    sessionService.editModeManager.cycleMode();
    setEditModeStatus(sessionService.editModeManager.getStatusMessage());
  }, [sessionService]);

  const handleExecutionModeChange = useCallback((mode: ExecutionMode) => {
    setExecutionMode(mode);
  }, []);

  const staticItems = [
    <Box key='header' flexDirection='column' marginBottom={1} paddingX={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
      <Text color={currentTheme.colors.info}>Welcome to Tempurai Code Assistant</Text>
      <Text> </Text>
      <Text>
        Type <Text color={currentTheme.colors.accent}>:</Text> for execution mode • <Text color={currentTheme.colors.accent}>/help</Text> for commands • <Text color={currentTheme.colors.accent}>Shift+Tab</Text> cycle edit mode
      </Text>
      <Text color={currentTheme.colors.text.muted}>cwd: {process.cwd()}</Text>
      <Text> </Text>
      <Text color={currentTheme.colors.text.muted}>AI can make mistakes, please check output carefully.</Text>
    </Box>,
    <Box key='title' marginBottom={1}>
      <Text color={currentTheme.colors.ui.highlight}>{'⚡'} </Text>
      <Text color={currentTheme.colors.primary} bold>
        Tempurai Code Assistant
      </Text>
      {editModeStatus && (
        <>
          <Text color={currentTheme.colors.text.muted}> • </Text>
          <Text color={currentTheme.colors.accent}>{editModeStatus}</Text>
        </>
      )}
      <Text color={currentTheme.colors.text.muted}> • </Text>
      <Text color={currentTheme.colors.info}>{getExecutionModeDisplayInfo(executionMode)?.displayName}</Text>
    </Box>,
    ...staticEvents
      .filter((event) => {
        const hiddenEventTypes = ['tool_confirmation_request', 'tool_confirmation_response'];
        return !hiddenEventTypes.includes(event.type);
      })
      .map((event, index) => (
        <Box key={event.id || `static-${index}`} marginBottom={1}>
          <EventRouter event={event} index={index} />
        </Box>
      )),
  ];

  return (
    <Box flexDirection='column'>
      <Static items={staticItems}>{(item) => item}</Static>

      {dynamicEvents.map((event, index) => (
        <Box key={event.id || `dynamic-${index}`} marginBottom={0}>
          <EventRouter event={event} index={index} />
        </Box>
      ))}

      {(isProcessing || !staticEvents.length) && (
        <Box marginY={0}>
          <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} sessionService={sessionService} />
        </Box>
      )}

      <Box marginTop={1}>
        <InputContainer
          onSubmit={handleSubmit}
          isProcessing={isProcessing}
          confirmationData={pendingConfirmation}
          onConfirm={handleConfirmation}
          editModeStatus={editModeStatus}
          onEditModeToggle={handleEditModeToggle}
          executionMode={executionMode}
          onExecutionModeChange={handleExecutionModeChange}
          sessionService={sessionService}
          exit={exit}
        />
      </Box>
    </Box>
  );
};

const CodeAssistantAppCore: React.FC<CodeAssistantAppProps> = ({ sessionService }) => {
  const { setTheme, availableThemes, themeName } = useTheme();
  const [appState, setAppState] = useState<AppState>('welcome');
  const { exit } = useApp();

  useInput((inputChar: string, key: any) => {
    if (key.escape) {
      sessionService.interrupt();
      return;
    }
    if (key.ctrl && inputChar === 'r') {
      return;
    }
    if (appState === 'welcome') {
      setAppState('theme-selection');
      return;
    }
  });

  const handleWelcomeDismiss = useCallback(() => setAppState('theme-selection'), []);
  const handleThemeSelected = useCallback(() => setAppState('ready'), []);

  if (appState === 'welcome') return <WelcomeScreen onDismiss={handleWelcomeDismiss} />;
  if (appState === 'theme-selection') return <ThemeSelectorWithPreview onThemeSelected={handleThemeSelected} onCancel={() => setAppState('welcome')} />;

  return <MainUI sessionService={sessionService} exit={exit} />;
};

const CodeAssistantApp: React.FC<CodeAssistantAppProps> = (props) => (
  <ThemeProvider defaultTheme='dark'>
    <CodeAssistantAppCore {...props} />
  </ThemeProvider>
);

export const startInkUI = async (sessionService: SessionService) => {
  console.log('Starting InkUI Interface...');
  const exitFn = () => {
    sessionService.interrupt();
    process.exit(0);
  };

  process.on('SIGTERM', exitFn);

  render(<CodeAssistantApp sessionService={sessionService} />, {
    patchConsole: false,
    exitOnCtrlC: false,
  });
};
