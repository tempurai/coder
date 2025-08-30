import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../themes/index.js';

interface DynamicInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder: string;
  isProcessing: boolean;
}

const HELP_CONTENT = [
  '📋 Available Commands:',
  '/help - Show this help',
  '/status - Show system status',
  '/session - Show session statistics',
  '/clear - Clear history',
  '/theme [name] - Change theme',
  '/exit - Exit application',
  '',
  '⌨️ Keyboard Shortcuts:',
  'Ctrl+C - Exit application',
  'Ctrl+T - Cycle through themes',
  'Tab - Toggle iteration details',
  '',
  '🎨 Available Themes:',
  'dark, light, monokai, solarized, dracula, high-contrast',
  '',
  '💡 Example Commands:',
  '"Fix the TypeScript errors in this file"',
  '"Add error handling to the API endpoint"',
  '"Refactor this component to use hooks"',
  '"Create a new React component for user profile"',
];

export const DynamicInput: React.FC<DynamicInputProps> = ({ value, onChange, onSubmit, placeholder, isProcessing }) => {
  const { currentTheme } = useTheme();
  const [showHelp, setShowHelp] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  // Monitor input for help trigger
  useEffect(() => {
    if (value === '?') {
      setShowHelp(true);
      setHelpVisible(true);
    } else if (value.length === 0 || !value.includes('?')) {
      setShowHelp(false);
      // Delay hiding help to avoid flickering
      const timer = setTimeout(() => {
        setHelpVisible(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const handleSubmit = (submittedValue: string) => {
    if (submittedValue === '?' || submittedValue === '/help') {
      // Clear the input but don't submit
      onChange('');
      return;
    }
    onSubmit(submittedValue);
  };

  return (
    <Box flexDirection='column'>
      {/* Dynamic Help Display */}
      {helpVisible && (
        <Box flexDirection='column' marginBottom={1} paddingX={2} paddingY={1} borderStyle='round' borderColor={currentTheme.colors.info}>
          <Box marginBottom={1}>
            <Text color={currentTheme.colors.info} bold>
              ? Quick Help
            </Text>
            <Text color={currentTheme.colors.text.muted}>(Clear input to hide)</Text>
          </Box>

          <Box flexDirection='column' marginLeft={1}>
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

      {/* Input Section with Border */}
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

      {/* Input Hints */}
      <Box marginTop={1}>
        <Text color={currentTheme.colors.text.muted}>
          {!showHelp ? (
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
