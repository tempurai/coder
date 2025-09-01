import React, { useState, useEffect, useCallback } from 'react';
import { render, Text, Box, useInput, Static } from 'ink';
import { SessionService } from '../services/SessionService.js';
import { ThemeName, ThemeProvider, useTheme } from './themes/index.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ThemeSelector } from './components/ThemeSelector.js';
import { DynamicInput } from './components/DynamicInput.js';
import { useSessionEvents } from './hooks/useSessionEvents.js';
import { EventItem } from './components/EventItem.js';
import { ProgressIndicator } from './components/ProgressIndicator.js';
import { UIEvent, UIEventType } from '../events/index.js';

type AppState = 'welcome' | 'theme-selection' | 'ready';

interface CodeAssistantAppProps {
  sessionService: SessionService;
}

interface MainUIProps {
  sessionService: SessionService;
  detailMode: boolean;
}

const MainUI: React.FC<MainUIProps> = ({ sessionService, detailMode }) => {
  const { currentTheme } = useTheme();
  const { events, isProcessing, pendingConfirmation, currentActivity, handleConfirmation, toolExecutions } = useSessionEvents(sessionService);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (isProcessing || pendingConfirmation) return;
      await sessionService.processTask(userInput);
    },
    [sessionService, isProcessing, pendingConfirmation],
  );

  // 分离静态和动态内容
  const { staticEvents, dynamicEvents } = React.useMemo(() => {
    const dynamic: UIEvent[] = [];
    const static_events: UIEvent[] = [];

    events.forEach((event) => {
      // 检查是否是正在进行的工具执行
      if (event.type === UIEventType.ToolExecutionStarted) {
        const toolEvent = event as any;
        const executionStatus = toolEvent.executionStatus || 'started';

        if (executionStatus === 'started' || executionStatus === 'executing') {
          dynamic.push(event);
        } else {
          static_events.push(event);
        }
      } else {
        // 其他事件直接放入静态区域
        static_events.push(event);
      }
    });

    return {
      staticEvents: static_events,
      dynamicEvents: dynamic,
    };
  }, [events]);

  const staticItems = [
    // Header
    <Box key='header' flexDirection='column' marginBottom={1} paddingX={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
      <Text color={currentTheme.colors.info}>Welcome to Tempurai Code Assistant</Text>
      <Text> </Text>
      <Text>Type /help for help, /status for your current setup</Text>
      <Text color={currentTheme.colors.text.muted}>cwd: {process.cwd()}</Text>
      <Text color={currentTheme.colors.text.muted}>Detail mode: {detailMode ? 'enabled' : 'disabled'} (Ctrl+R to toggle)</Text>
      <Text> </Text>
      <Text color={currentTheme.colors.text.muted}>AI Can make mistake, please make sure to check the output carefully.</Text>
    </Box>,

    // Title
    <Box key='title'>
      <Text color={currentTheme.colors.ui.highlight}>{'⚡'} </Text>
      <Text color={currentTheme.colors.primary} bold>
        Tempurai Code Assistant
      </Text>
    </Box>,

    // Static events
    ...staticEvents.map((event, index) => (
      <Box key={event.id || `static-${index}`}>
        <EventItem event={event} index={index} detailMode={detailMode} />
      </Box>
    )),
  ];

  return (
    <Box flexDirection='column'>
      {/* Static content */}
      <Static items={staticItems}>{(item) => item}</Static>

      {/* Dynamic content */}
      {dynamicEvents.map((event, index) => (
        <Box key={event.id || `dynamic-${index}`}>
          <EventItem event={event} index={index} detailMode={detailMode} />
        </Box>
      ))}

      {/* Processing indicator */}
      {isProcessing && (
        <Box>
          <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} />
        </Box>
      )}

      {/* Input */}
      <Box marginTop={1} paddingTop={1}>
        <DynamicInput onSubmit={handleSubmit} isProcessing={isProcessing} confirmationData={pendingConfirmation} onConfirm={handleConfirmation} />
      </Box>
    </Box>
  );
};

const CodeAssistantAppCore: React.FC<CodeAssistantAppProps> = ({ sessionService }) => {
  const { setTheme, availableThemes, themeName } = useTheme();
  const [appState, setAppState] = useState<AppState>('welcome');
  const [detailMode, setDetailMode] = useState<boolean>(false);
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

    if (key.ctrl && inputChar === 'r') {
      setDetailMode((prev) => !prev);
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

  return <MainUI sessionService={sessionService} detailMode={detailMode} />;
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
