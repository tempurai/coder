import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onDismiss }) => {
  const { currentTheme } = useTheme();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 3000); // Auto-dismiss after 3 seconds

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const logoLines = [
    "╔════════════════════════════════════════╗",
    "║                                        ║",
    "║        ████████                       ║",
    "║           ██   ██████  ██    ██ ██████ ║",
    "║           ██   ██      ███  ███ ██     ║", 
    "║           ██   ████    ████████ ████   ║",
    "║           ██   ██      ██  ██ ██ ██     ║",
    "║           ██   ██████  ██    ██ ██████ ║",
    "║                                        ║",
    "║    ███████ ████████ ██   ██ ████████   ║",
    "║    ██         ██    ██   ██    ██      ║",
    "║    ███████    ██    ███████    ██      ║",
    "║         ██    ██    ██   ██    ██      ║",
    "║    ███████    ██    ██   ██ ████████   ║",
    "║                                        ║",
    "║              TEMPURAI                  ║",
    "║        AI-Powered Code Assistant       ║",
    "║                                        ║",
    "╚════════════════════════════════════════╝"
  ];

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" minHeight={25}>
      <Box flexDirection="column" alignItems="center" marginBottom={2}>
        {logoLines.map((line, index) => (
          <Text key={index} color={currentTheme.colors.primary}>
            {line}
          </Text>
        ))}
      </Box>
      
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Text color={currentTheme.colors.text.secondary}>
          Initializing enhanced interface...
        </Text>
        <Text color={currentTheme.colors.text.muted}>
          Press any key to continue
        </Text>
      </Box>
    </Box>
  );
};