import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';
import { MAX_FRAME_WIDTH } from './base.js';

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onDismiss }) => {
  const { currentTheme } = useTheme();

  useInput(() => onDismiss());

  React.useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const logo = String.raw`
   _____                                    _ 
|_   _|                                  (_)
  | | ___ _ __ ___  _ __  _   _ _ __ __ _ _ 
  | |/ _ \ '_ \` _ \| '_ \| | | | '__/ _\` | |
  | |  __/ | | | | | |_) | |_| | | | (_| | |
  \_/\___|_| |_| |_| .__/ \__,_|_|  \__,_|_|
                   | |                      
                   |_|                      
  `.trim();

  const c = currentTheme?.colors ?? ({} as any);
  const border = c.ui?.border ?? 'gray';
  const primary = c.primary ?? 'cyan';
  const textSecondary = c.text?.secondary ?? 'white';
  const textMuted = c.text?.muted ?? 'gray';

  return (
    <Box width='100%' justifyContent='flex-start' minHeight={25}>
      <Box width={MAX_FRAME_WIDTH} flexDirection='column' alignItems='flex-start'>
        <Box borderStyle='round' borderColor={border} paddingX={2} paddingY={1} marginY={1} width='100%' justifyContent='center'>
          <Box flexDirection='column' alignItems='center'>
            {logo.split('\n').map((line, i) => (
              <Text key={i} color={primary}>
                {line}
              </Text>
            ))}
          </Box>
        </Box>

        <Box flexDirection='column' alignItems='center' width='100%' borderStyle='round' borderColor={border} paddingX={2} paddingY={1}>
          <Text color={textSecondary}>Initializing enhanced interface...</Text>
          <Text color={textMuted}>Press any key to continue</Text>
        </Box>
      </Box>
    </Box>
  );
};
