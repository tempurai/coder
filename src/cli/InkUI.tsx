import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { render, Text, Box, useInput, Static, useApp } from 'ink';
import { SessionService } from '../services/SessionService.js';
import { ThemeProvider, useTheme } from './themes/index.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ThemeSelector, ThemeSelectorWithPreview } from './components/ThemeSelector.js';
import { InputContainer } from './components/InputContainer.js';
import { useSessionEvents } from './hooks/useSessionEvents.js';
import { EventRouter } from './components/events/EventRouter.js';
import { ProgressIndicator } from './components/ProgressIndicator.js';
import { ExecutionMode, getExecutionModeDisplayInfo } from '../services/ExecutionModeManager.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ExecutionModeSelector } from './components/ExecutionModeSelector.js';
import { HelpPanel } from './components/HelpPanel.js';
import { ConfirmationChoice } from '../services/HITLManager.js';
import { useUiStore, ActivePanel } from './stores/uiStore.js';

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
  const { executionMode, activePanel, actions } = useUiStore();
  const { setExecutionMode, setActivePanel } = actions;
  const [editModeStatus, setEditModeStatus] = useState<string>('');
  const [inputKey, setInputKey] = useState(1);

  const headerItems = useMemo(
    () => [
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
    ],
    [currentTheme, editModeStatus, executionMode],
  );

  const lastStatusRef = useRef('');

  useEffect(() => {
    const updateStatus = () => {
      const nextStatus = sessionService.editModeManager.getStatusMessage();
      if (nextStatus !== lastStatusRef.current) {
        lastStatusRef.current = nextStatus;
        setEditModeStatus(nextStatus);
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, [sessionService]);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (isProcessing || pendingConfirmation) return;
      setActivePanel('INPUT');
      await sessionService.processTask(userInput, executionMode);
    },
    [sessionService, isProcessing, pendingConfirmation, executionMode, setActivePanel],
  );

  const handleEditModeToggle = useCallback(() => {
    sessionService.editModeManager.cycleMode();
  }, [sessionService]);

  const handlePanelClose = useCallback(() => {
    setActivePanel('INPUT');
    setInputKey((k) => k + 1);
  }, [setActivePanel]);

  const getChoiceText = (choice: ConfirmationChoice): string => {
    const isEditOperation = pendingConfirmation?.options?.isEditOperation || false;
    switch (choice) {
      case ConfirmationChoice.YES:
        return isEditOperation ? 'Yes (this time only)' : 'Yes';
      case ConfirmationChoice.NO:
        return 'No';
      case ConfirmationChoice.YES_AND_REMEMBER:
        return isEditOperation ? "Yes, and don't ask again for edits during this session" : 'Yes and remember this choice';
      default:
        return 'Unknown';
    }
  };

  const getChoiceColor = (choice: ConfirmationChoice, isSelected: boolean): string => {
    if (!isSelected) return currentTheme.colors.text.secondary;
    switch (choice) {
      case ConfirmationChoice.YES:
        return currentTheme.colors.success;
      case ConfirmationChoice.NO:
        return currentTheme.colors.error;
      case ConfirmationChoice.YES_AND_REMEMBER:
        return currentTheme.colors.warning;
      default:
        return currentTheme.colors.text.primary;
    }
  };

  const isInputFocused = activePanel === 'INPUT';
  const isModalPanelVisible = activePanel === 'CONFIRMATION';
  const isMenuPanelVisible = ['COMMAND_PALETTE', 'EXECUTION_MODE', 'HELP', 'THEME'].includes(activePanel);

  return (
    <Box flexDirection='column'>
      {/* Unified Rendering Logic */}
      {headerItems.map((item) => item)}
      {cliEvents.map((event, index) => (
        <Box key={event.id || `event-${index}`} marginBottom={1}>
          <EventRouter event={event} index={index} />
        </Box>
      ))}

      {(isProcessing || (cliEvents.length === 0 && !pendingConfirmation)) && (
        <Box marginY={0}>
          <ProgressIndicator phase='processing' message={currentActivity} isActive={isProcessing} sessionService={sessionService} />
        </Box>
      )}

      {}
      <Box flexDirection='column' marginTop={1}>
        {}
        {isModalPanelVisible && pendingConfirmation && (
          <Box marginBottom={1}>
            <ConfirmationPanel
              confirmationData={pendingConfirmation}
              onConfirm={(confirmationId: string, choice: 'yes' | 'no' | 'yes_and_remember') => {
                handleConfirmation(confirmationId, choice);
                handlePanelClose();
              }}
              getChoiceText={getChoiceText}
              getChoiceColor={getChoiceColor}
              theme={currentTheme}
              isFocused={activePanel === 'CONFIRMATION'}
            />
          </Box>
        )}
        <InputContainer key={inputKey} onSubmit={handleSubmit} isProcessing={isProcessing || !!pendingConfirmation} onEditModeToggle={handleEditModeToggle} sessionService={sessionService} exit={exit} focus={isInputFocused} />
        {}
        {isMenuPanelVisible && (
          <Box marginTop={1}>
            {activePanel === 'COMMAND_PALETTE' && (
              <CommandPalette
                onSelect={handlePanelClose}
                onCancel={handlePanelClose}
                onModeSelect={() => setActivePanel('EXECUTION_MODE')}
                onThemeSelect={() => setActivePanel('THEME')}
                isFocused={activePanel === 'COMMAND_PALETTE'}
              />
            )}
            {activePanel === 'EXECUTION_MODE' && (
              <ExecutionModeSelector
                currentMode={executionMode}
                onModeSelected={(mode) => {
                  setExecutionMode(mode);
                  handlePanelClose();
                }}
                onCancel={handlePanelClose}
                isFocused={activePanel === 'EXECUTION_MODE'}
              />
            )}
            {activePanel === 'HELP' && <HelpPanel onCancel={handlePanelClose} isFocused={activePanel === 'HELP'} />}
            {activePanel === 'THEME' && <ThemeSelector onThemeSelected={handlePanelClose} onCancel={handlePanelClose} isFocused={activePanel === 'THEME'} />}
          </Box>
        )}
      </Box>
    </Box>
  );
};

const ConfirmationPanel = ({ confirmationData, onConfirm, getChoiceText, getChoiceColor, theme, isFocused }: any) => {
  const [selectedChoice, setSelectedChoice] = useState<ConfirmationChoice>(confirmationData?.options?.defaultChoice ?? ConfirmationChoice.YES);
  const showRememberOption = confirmationData?.options?.showRememberOption !== false;
  const choices: ConfirmationChoice[] = showRememberOption ? [ConfirmationChoice.YES, ConfirmationChoice.NO, ConfirmationChoice.YES_AND_REMEMBER] : [ConfirmationChoice.YES, ConfirmationChoice.NO];
  const { currentTheme } = useTheme();

  useInput(
    (char, key) => {
      if (key.upArrow) {
        const currentIndex = choices.indexOf(selectedChoice);
        const newIndex = currentIndex > 0 ? currentIndex - 1 : choices.length - 1;
        setSelectedChoice(choices[newIndex]);
      } else if (key.downArrow) {
        const currentIndex = choices.indexOf(selectedChoice);
        const newIndex = currentIndex < choices.length - 1 ? currentIndex + 1 : 0;
        setSelectedChoice(choices[newIndex]);
      } else if (key.return) {
        onConfirm(confirmationData.confirmationId, selectedChoice);
      } else if (key.escape) {
        onConfirm(confirmationData.confirmationId, ConfirmationChoice.NO);
      } else if (char?.toLowerCase() === 'y') {
        onConfirm(confirmationData.confirmationId, ConfirmationChoice.YES);
      } else if (char?.toLowerCase() === 'n') {
        onConfirm(confirmationData.confirmationId, ConfirmationChoice.NO);
      } else if (char?.toLowerCase() === 'a' && showRememberOption) {
        onConfirm(confirmationData.confirmationId, ConfirmationChoice.YES_AND_REMEMBER);
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection='column'>
      <Box flexDirection='column' paddingX={2} paddingY={1} borderStyle='round' borderColor={theme.colors.warning}>
        <Box marginBottom={1}>
          <Text color={theme.colors.warning} bold>
            {confirmationData.options?.isEditOperation ? 'File Edit Confirmation' : 'Command Confirmation Required'}
          </Text>
        </Box>
        <Box flexDirection='column' marginBottom={1}>
          <Text color={theme.colors.text.primary} bold>
            Tool: {confirmationData.toolName}
          </Text>
          <Text color={theme.colors.text.secondary}>{confirmationData.description}</Text>
        </Box>
        {confirmationData.args && Object.keys(confirmationData.args).length > 0 && (
          <Box flexDirection='column' marginBottom={1}>
            <Text color={theme.colors.text.muted}>Parameters:</Text>
            <Box marginLeft={2}>
              <Text color={theme.colors.text.secondary}>{JSON.stringify(confirmationData.args, null, 2)}</Text>
            </Box>
          </Box>
        )}
        <Box flexDirection='column' marginBottom={1}>
          <Text color={theme.colors.text.primary} bold>
            Do you want to proceed?
          </Text>
          {choices.map((choice, index) => (
            <Box key={choice} marginLeft={2}>
              <Text color={getChoiceColor(choice, selectedChoice === choice)} bold={selectedChoice === choice}>
                {selectedChoice === choice ? '⏵ ' : '  '}
                {index + 1}. {getChoiceText(choice)}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
      <Text color={theme.colors.text.muted}>
        <Text color={theme.colors.accent}>↑/↓</Text> Navigate •<Text color={currentTheme.colors.accent}>Enter</Text> Confirm •<Text color={currentTheme.colors.accent}>Esc</Text> Cancel
        {showRememberOption && (
          <>
            {' '}
            • <Text color={currentTheme.colors.accent}>Y/N/A</Text> Quick select
          </>
        )}
      </Text>
    </Box>
  );
};

const CodeAssistantAppCore: React.FC<CodeAssistantAppProps> = ({ sessionService }) => {
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
