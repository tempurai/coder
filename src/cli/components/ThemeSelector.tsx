import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';
import { themes } from '../themes/themes/index.js';
import { CodePreview } from './CodePreview.js';

interface ThemeSelectorProps {
  onThemeSelected: () => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ onThemeSelected }) => {
  const { currentTheme, availableThemes, setTheme, themeName } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewTheme, setPreviewTheme] = useState(availableThemes[0]);

  // Update preview theme when selection changes
  useEffect(() => {
    setPreviewTheme(availableThemes[selectedIndex]);
  }, [selectedIndex, availableThemes]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : availableThemes.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => (prev < availableThemes.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      setTheme(availableThemes[selectedIndex]);
      onThemeSelected();
    }
  });

  const getThemePreview = (theme: string) => {
    switch (theme) {
      case 'dark': return '🌑 Professional dark theme (Claude Code style)';
      case 'light': return '🌕 Clean light theme for daytime coding';
      case 'monokai': return '🟫 Classic Monokai - warm dark colors';
      case 'solarized': return '🟡 Solarized Dark - eye-friendly colors';
      case 'dracula': return '🧛 Dracula - dark with vibrant purples';
      case 'high-contrast': return '⚫ High contrast for accessibility';
      default: return 'Theme preview';
    }
  };

  return (
    <Box flexDirection="row" width="100%">
      {/* Left side - Theme list */}
      <Box flexDirection="column" marginRight={4} width={30}>
        <Box marginBottom={2} paddingX={2} borderStyle="round" borderColor={currentTheme.colors.ui.border}>
          <Text color={currentTheme.colors.primary} bold>
            🎨 Choose Your Theme
          </Text>
        </Box>
        
        <Box flexDirection="column">
          {availableThemes.map((theme, index) => (
            <Box key={theme} marginY={0}>
              <Text 
                color={index === selectedIndex ? currentTheme.colors.accent : currentTheme.colors.text.primary}
                bold={index === selectedIndex}
              >
                {index === selectedIndex ? '▶ ' : '  '}
                {theme.charAt(0).toUpperCase() + theme.slice(1).replace('-', ' ')}
              </Text>
              <Box marginLeft={4}>
                <Text color={currentTheme.colors.text.muted}>
                  {getThemePreview(theme)}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
        
        <Box marginTop={2} flexDirection="column">
          <Text color={currentTheme.colors.text.secondary}>
            Use ↑↓ arrows to navigate, Enter to select
          </Text>
          <Text color={currentTheme.colors.text.muted}>
            You can change themes later with /theme [name] or Ctrl+T
          </Text>
        </Box>
      </Box>

      {/* Right side - Live preview */}
      <Box flexDirection="column" flexGrow={1}>
        <Text color={currentTheme.colors.accent} bold marginBottom={1}>
          🔍 Live Preview - {previewTheme.charAt(0).toUpperCase() + previewTheme.slice(1)}
        </Text>
        <CodePreview theme={themes[previewTheme]} />
      </Box>
    </Box>
  );
};