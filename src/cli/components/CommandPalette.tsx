import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';

interface Command {
  name: string;
  description: string;
  usage: string;
}

interface CommandPaletteProps {
  onSelect: (command: string) => void;
  onCancel: () => void;
  onModeSelect?: () => void;
  onThemeSelect?: () => void;
  isFocused: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onSelect, onCancel, onModeSelect, onThemeSelect, isFocused }) => {
  const { currentTheme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const commands: Command[] = [
    {
      name: 'help',
      description: 'Show available commands',
      usage: '/help',
    },
    {
      name: 'theme',
      description: 'Switch theme or list available themes',
      usage: '/theme',
    },
    {
      name: 'mode',
      description: 'Show execution mode selector',
      usage: '/mode',
    },
  ];

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : commands.length - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < commands.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        const selectedCommand = commands[selectedIndex];
        if (selectedCommand.name === 'mode' && onModeSelect) {
          onModeSelect();
        } else if (selectedCommand.name === 'theme' && onThemeSelect) {
          onThemeSelect();
        } else {
          onSelect(selectedCommand.usage);
        }
      } else if (key.escape) {
        onCancel();
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection='column' paddingLeft={1} paddingRight={3} borderStyle='round' borderColor={currentTheme.colors.ui.border}>
      <Box marginBottom={1}>
        <Text color={currentTheme.colors.primary} bold>
          Available Commands
        </Text>
      </Box>
      <Box flexDirection='column'>
        {commands.map((command, index) => (
          <Box key={command.name} flexDirection='row' marginY={0}>
            <Box width={40}>
              <Text color={index === selectedIndex ? currentTheme.colors.accent : currentTheme.colors.text.primary} bold={index === selectedIndex}>
                {index === selectedIndex ? '⏵ ' : '  '}
                {command.usage}
              </Text>
            </Box>
            <Text color={currentTheme.colors.text.muted}>{command.description}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={currentTheme.colors.text.muted}>
          <Text color={currentTheme.colors.accent}>↑/↓</Text> Navigate • <Text color={currentTheme.colors.accent}>Enter</Text> Select • <Text color={currentTheme.colors.accent}>Esc</Text> Cancel
        </Text>
      </Box>
    </Box>
  );
};
