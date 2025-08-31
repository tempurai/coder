import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../themes/index.js';

interface ConfirmationData {
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
}

interface DynamicInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder: string;
  isProcessing: boolean;
  confirmationData?: ConfirmationData;
  onConfirm?: (confirmationId: string, approved: boolean) => void;
}

type ConfirmationChoice = 'yes' | 'no';

const HELP_CONTENT = [
  '📋 Available Commands:',
  '/help - Show this help',
  '/status - Show system status',
  '/session - Show session statistics',
  '/clear - Clear history',
  '/theme [name] - Change theme',
  '/exit - Exit application',
  ' ',
  '⌨️ Keyboard Shortcuts:',
  'Ctrl+C - Exit application',
  'Ctrl+T - Cycle through themes',
  'Tab - Toggle iteration details',
  ' ',
  '🎨 Available Themes:',
  'dark, light, monokai, solarized, dracula, high-contrast',
  ' ',
  '💡 Example Commands:',
  '"Fix the TypeScript errors in this file"',
  '"Add error handling to the API endpoint"',
  '"Refactor this component to use hooks"',
  '"Create a new React component for user profile"',
];

export const DynamicInput: React.FC<DynamicInputProps> = ({ value, onChange, onSubmit, placeholder, isProcessing, confirmationData, onConfirm }) => {
  const { currentTheme } = useTheme();
  const [helpVisible, setHelpVisible] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<ConfirmationChoice>('yes');

  const isConfirmationMode = !!confirmationData;

  // Show help when typing ? or /help
  useEffect(() => {
    if (!isConfirmationMode && (value === '?' || value === '/help')) {
      setHelpVisible(true);
    } else {
      setHelpVisible(false);
    }
  }, [value, isConfirmationMode]);

  // Handle confirmation mode input
  useInput(
    (input, key) => {
      if (!isConfirmationMode) return;

      if (key.leftArrow) {
        setSelectedChoice('yes');
      } else if (key.rightArrow) {
        setSelectedChoice('no');
      } else if (key.return) {
        if (confirmationData && onConfirm) {
          onConfirm(confirmationData.confirmationId, selectedChoice === 'yes');
        }
      } else if (key.escape) {
        if (confirmationData && onConfirm) {
          onConfirm(confirmationData.confirmationId, false);
        }
      } else if (input === 'y' || input === 'Y') {
        setSelectedChoice('yes');
        if (confirmationData && onConfirm) {
          onConfirm(confirmationData.confirmationId, true);
        }
      } else if (input === 'n' || input === 'N') {
        setSelectedChoice('no');
        if (confirmationData && onConfirm) {
          onConfirm(confirmationData.confirmationId, false);
        }
      }
    },
    { isActive: isConfirmationMode },
  );

  const handleSubmit = (submittedValue: string) => {
    if (submittedValue === '?' || submittedValue === '/help') {
      // Clear input to hide help
      onChange('');
      return;
    }
    onSubmit(submittedValue);
  };

  if (isConfirmationMode && confirmationData) {
    return (
      <Box flexDirection='column'>
        {/* Compact Confirmation Panel */}
        <Box flexDirection='column' marginY={1} paddingX={2} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.warning}>
          <Box marginBottom={1}>
            <Text color={currentTheme.colors.warning} bold>
              Tool Confirmation Required
            </Text>
          </Box>

          <Box flexDirection='column' marginBottom={1}>
            <Text color={currentTheme.colors.text.primary} bold>
              Tool: {confirmationData.toolName}
            </Text>
            <Text color={currentTheme.colors.text.secondary}>{confirmationData.description}</Text>
          </Box>

          {confirmationData.args && Object.keys(confirmationData.args).length > 0 && (
            <Box flexDirection='column' marginBottom={1}>
              <Text color={currentTheme.colors.text.muted}>Parameters:</Text>
              <Box marginLeft={2}>
                <Text color={currentTheme.colors.text.secondary}>{JSON.stringify(confirmationData.args, null, 2)}</Text>
              </Box>
            </Box>
          )}

          <Box>
            <Text color={selectedChoice === 'yes' ? currentTheme.colors.success : currentTheme.colors.success} bold={selectedChoice === 'yes'}>
              Y
            </Text>
            <Text color={currentTheme.colors.text.primary}>es / </Text>
            <Text color={selectedChoice === 'no' ? currentTheme.colors.error : currentTheme.colors.error} bold={selectedChoice === 'no'}>
              N
            </Text>
            <Text color={currentTheme.colors.text.primary}>o / </Text>
            <Text color={currentTheme.colors.accent}>Enter</Text>
            <Text color={currentTheme.colors.text.muted}> to confirm</Text>
          </Box>
        </Box>

        {/* Input Area (Disabled during confirmation) */}
        <Box borderStyle='round' borderColor={currentTheme.colors.warning} paddingX={1} paddingY={0}>
          <Box alignItems='center' width='100%'>
            <Text color={currentTheme.colors.warning} bold>
              ⏳
            </Text>
            <Box marginLeft={1}>
              <Text color={currentTheme.colors.warning}>Waiting for confirmation...</Text>
            </Box>
          </Box>
        </Box>

        {/* Instructions */}
        <Box marginTop={1}>
          <Text color={currentTheme.colors.text.muted}>
            <Text color={currentTheme.colors.accent}>Y/N</Text> Direct •<Text color={currentTheme.colors.accent}>Enter</Text> Confirm •<Text color={currentTheme.colors.accent}>Esc</Text> Cancel
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection='column'>
      {/* Help Panel */}
      {helpVisible && (
        <Box flexDirection='column' marginBottom={1} paddingX={2} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.info}>
          <Box marginBottom={1}>
            <Text color={currentTheme.colors.info} bold>
              Quick Help
            </Text>
            <Text color={currentTheme.colors.text.muted}> (Clear input to hide)</Text>
          </Box>
          <Box flexDirection='column'>
            {HELP_CONTENT.map((line, index) => (
              <Text
                key={index}
                color={
                  line.startsWith('📋') || line.startsWith('⌨️') || line.startsWith('🎨') || line.startsWith('💡')
                    ? currentTheme.colors.accent
                    : line.startsWith('/') || line.startsWith('Ctrl+') || line.startsWith('Tab')
                      ? currentTheme.colors.primary
                      : line.includes(',')
                        ? currentTheme.colors.text.secondary
                        : line.startsWith('"')
                          ? currentTheme.colors.success
                          : currentTheme.colors.text.primary
                }
              >
                {line}
              </Text>
            ))}
          </Box>
        </Box>
      )}

      {/* Normal Input Area */}
      <Box borderStyle='round' borderColor={isProcessing ? currentTheme.colors.warning : currentTheme.colors.ui.border} paddingX={1} paddingY={0}>
        <Box alignItems='center' width='100%'>
          <Text color={isProcessing ? currentTheme.colors.warning : currentTheme.colors.success} bold>
            {isProcessing ? '⏳ ' : '❯ '}
          </Text>
          {!isProcessing ? (
            <Box flexGrow={1} marginLeft={1}>
              <Text color={currentTheme.colors.text.primary}>
                <TextInput value={value} onChange={onChange} onSubmit={handleSubmit} placeholder={placeholder} showCursor={true} />
              </Text>
            </Box>
          ) : (
            <Box marginLeft={1}>
              <Text color={currentTheme.colors.warning}>Processing your request...</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Instructions */}
      <Box marginTop={1}>
        <Text color={currentTheme.colors.text.muted}>
          {!helpVisible ? (
            <>
              Type <Text color={currentTheme.colors.accent}>?</Text> for help •<Text color={currentTheme.colors.accent}>/theme</Text> to change colors •<Text color={currentTheme.colors.accent}>Ctrl+C</Text> to exit
            </>
          ) : (
            <>Clear input to hide help • Enter to execute commands</>
          )}
        </Text>
      </Box>
    </Box>
  );
};
