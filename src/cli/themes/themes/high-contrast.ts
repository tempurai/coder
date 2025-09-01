import { ThemeConfig } from '../ThemeTypes.js';

export const highContrastTheme: ThemeConfig = {
  name: 'high-contrast',
  displayName: 'High Contrast',
  type: 'dark',
  colors: {
    primary: '#FFFFFF',
    secondary: '#FFFF00',
    accent: '#00FFFF',

    success: '#00FF00',
    warning: '#FFFF00',
    error: '#FF0000',
    info: '#00FFFF',

    text: {
      primary: '#FFFFFF',
      secondary: '#FFFFFF',
      muted: '#CCCCCC',
      inverse: '#000000',
    },

    background: {
      primary: '#000000',
      secondary: '#111111',
      tertiary: '#222222',
    },

    ui: {
      border: '#FFFFFF',
      separator: '#FFFFFF',
      highlight: '#FFFF00',
      selection: '#0000FF',
      progress: '#00FF00',
    },

    tools: {
      shell: '#00FF00',
      file: '#FFFF00',
      git: '#FF8800',
      web: '#FF00FF',
      code: '#00FFFF',
    },

    react: {
      thought: '#00FFFF',
      plan: '#00FF00',
      action: '#FFFF00',
      observation: '#FF00FF',
    },

    syntax: {
      keyword: '#FFFF00',
      string: '#00FF00',
      function: '#00FFFF',
      property: '#FF00FF',
      punctuation: '#FFFFFF',
      comment: '#CCCCCC',
      number: '#FF8800',
      operator: '#FFFF00',
    },

    diff: {
      added: '#00FF00',
      removed: '#FF0000',
      modified: '#FFFF00',
      context: '#CCCCCC',
      lineNumber: '#CCCCCC',
    },

    semantic: {
      functionCall: '#FFFFFF',
      parameter: '#FF00FF',
      result: '#FFFFFF',
      metadata: '#CCCCCC',
      indicator: '#CCCCCC',
    },
  },

  fonts: {
    mono: true,
    size: 'large',
  },

  layout: {
    compact: false,
    showTimestamps: true,
    showProgress: true,
  },

  animation: {
    enabled: false,
    speed: 'slow',
  },
};