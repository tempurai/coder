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
  const { events, isProcessing, pendingConfirmation, currentActivity, handleConfirmation } = useSessionEvents(sessionService);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (isProcessing || pendingConfirmation) return;
      await sessionService.processTask(userInput);
    },
    [sessionService, isProcessing, pendingConfirmation],
  );

  const mask = (val?: string) => (val ? `${val.slice(0, 6)}…${val.slice(-4)}` : 'not set');

  // 将静态内容定义为JSX元素数组，供<Static>组件使用
  const staticItems = [
    // 1. 静态的欢迎和环境信息Box
    <Box key='header' flexDirection='column' marginY={1} paddingX={1} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
      <Text color={currentTheme.colors.info}>Welcome to Tempurai Code Assistant</Text>
      <Text> </Text>
      <Text>Type /help for help, /status for your current setup</Text>
      <Text color={currentTheme.colors.text.muted}>cwd: {process.cwd()}</Text>
      <Text color={currentTheme.colors.text.muted}>Detail mode: {detailMode ? 'enabled' : 'disabled'} (Ctrl+R to toggle)</Text>
      <Text> </Text>
      <Text>Environment:</Text>
      <Text color={currentTheme.colors.text.muted}>API Key: {mask(process.env.API_KEY || process.env.OPENAI_API_KEY)}</Text>
      <Text color={currentTheme.colors.text.muted}>API Base URL: {process.env.API_BASE_URL || process.env.OPENAI_BASE_URL || 'not set'}</Text>
    </Box>,

    // 2. 静态的任务标题
    <Box key='title'>
      <Text color={currentTheme.colors.ui.highlight}>{'⚡'} </Text>
      <Text color={currentTheme.colors.primary} bold>
        Tempurai Code Assistant
      </Text>
    </Box>,

    // 3. 将所有历史事件映射为EventItem组件
    ...events.map((event, index) => (
      <Box key={event.id} marginY={1}>
        <EventItem event={event} index={index} detailMode={detailMode} />
      </Box>
    )),
  ];

  return (
    <Box flexDirection='column'>
      {/* <Static>区域：渲染所有历史内容，永不重绘 */}
      <Static items={staticItems}>{(item) => item}</Static>

      {/* 动态区域：只在需要时渲染，位于所有静态内容下方 */}
      {isProcessing && (
        <Box marginY={1}>
          <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} />
        </Box>
      )}

      <Box marginTop={1} paddingTop={1}>
        <DynamicInput onSubmit={handleSubmit} placeholder='Ask me anything or type /help for help...' isProcessing={isProcessing} confirmationData={pendingConfirmation} onConfirm={handleConfirmation} />
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
