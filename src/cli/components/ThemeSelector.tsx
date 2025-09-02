import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';
import { themes } from '../themes/themes/index.js';
import { CodePreview } from './CodePreview.js';

interface ThemeSelectorProps {
  onThemeSelected: () => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ onThemeSelected }) => {
  const { currentTheme, availableThemes = [], setTheme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewTheme, setPreviewTheme] = useState(availableThemes[0] ?? 'dark');

  useEffect(() => {
    if (availableThemes.length > 0) {
      setPreviewTheme(availableThemes[selectedIndex]);
    }
  }, [selectedIndex, availableThemes]);

  useInput((input, key) => {
    if (!availableThemes.length) return;
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : availableThemes.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < availableThemes.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      setTheme(availableThemes[selectedIndex]);
      onThemeSelected();
    }
  });

  const getThemePreview = (theme: string) => {
    switch (theme) {
      case 'dark':
        return '🌑 Professional dark theme (Claude Code style)';
      case 'light':
        return '🌕 Clean light theme for daytime coding';
      case 'monokai':
        return '🟫 Classic Monokai - warm dark colors';
      case 'solarized':
        return '🟡 Solarized Dark - eye-friendly colors';
      case 'dracula':
        return '🧛 Dracula - dark with vibrant purples';
      case 'high-contrast':
        return '⚫ High contrast for accessibility';
      default:
        return 'Theme preview';
    }
  };

  const c = currentTheme?.colors ?? ({} as any);
  const primary = c.primary ?? 'cyan';
  const accent = c.accent ?? 'magenta';
  const textPrimary = c.text?.primary ?? 'white';
  const textSecondary = c.text?.secondary ?? 'white';
  const textMuted = c.text?.muted ?? 'gray';

  return (
    <Box flexDirection='column' width='100%' alignItems='flex-start'>
      {/* Top — Live preview */}
      <Box flexDirection='column' paddingX={2} paddingY={1} marginY={1}>
        <Text color={accent} bold>
          🔍 Live Preview — {previewTheme?.charAt(0).toUpperCase() + previewTheme?.slice(1)}
        </Text>
        <CodePreview theme={themes[previewTheme]} />
      </Box>

      {/* Bottom — Theme list & help */}
      <Box flexDirection='column' paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text color={primary} bold>
            🎨 Choose Your Theme
          </Text>
        </Box>

        <Box flexDirection='column'>
          {availableThemes.map((theme, index) => (
            <Box key={theme} flexDirection='row' marginY={0}>
              {/* Theme name */}
              <Box width={20}>
                <Text color={index === selectedIndex ? accent : textPrimary} bold={index === selectedIndex}>
                  {index === selectedIndex ? '⏵ ' : '  '}
                  {theme.charAt(0).toUpperCase() + theme.slice(1).replace('-', ' ')}
                </Text>
              </Box>

              {/* Preview aligned to same start */}
              <Text color={textMuted}>{getThemePreview(theme)}</Text>
            </Box>
          ))}
          {!availableThemes.length && <Text color={textMuted}>No themes found.</Text>}
        </Box>

        <Box marginTop={1}>
          <Text>
            <Text color={textSecondary}>Use ↑↓ to navigate, Enter to select </Text>
            <Text color={textMuted}>You can change themes later with /theme [name] or Ctrl+T</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
