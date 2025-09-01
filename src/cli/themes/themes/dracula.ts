import { ThemeConfig } from '../ThemeTypes.js';

export const draculaTheme: ThemeConfig = {
  name: 'dracula',
  displayName: 'Dracula',
  type: 'dark',
  colors: {
    primary: '#BD93F9',
    secondary: '#8BE9FD',
    accent: '#50FA7B',

    success: '#50FA7B',
    warning: '#F1FA8C',
    error: '#FF5555',
    info: '#8BE9FD',

    text: {
      primary: '#F8F8F2',
      secondary: '#F8F8F2',
      muted: '#6272A4',
      inverse: '#282A36',
    },

    background: {
      primary: '#282A36',
      secondary: '#44475A',
      tertiary: '#6272A4',
    },

    ui: {
      border: '#6272A4',
      separator: '#44475A',
      highlight: '#BD93F9',
      selection: '#44475A',
      progress: '#50FA7B',
    },

    tools: {
      shell: '#50FA7B',
      file: '#F1FA8C',
      git: '#FFB86C',
      web: '#BD93F9',
      code: '#8BE9FD',
    },

    react: {
      thought: '#8BE9FD',
      plan: '#50FA7B',
      action: '#FFB86C',
      observation: '#BD93F9',
    },

    syntax: {
      keyword: '#FF79C6',
      string: '#F1FA8C',
      function: '#50FA7B',
      property: '#8BE9FD',
      punctuation: '#F8F8F2',
      comment: '#6272A4',
      number: '#BD93F9',
      operator: '#FF79C6',
    },

    diff: {
      added: '#50FA7B',
      removed: '#FF5555',
      modified: '#FFB86C',
      context: '#6272A4',
      lineNumber: '#6272A4',
    },

    semantic: {
      functionCall: '#BD93F9',
      parameter: '#8BE9FD',
      result: '#F8F8F2',
      metadata: '#6272A4',
      indicator: '#6272A4',
    },
  },

  fonts: {
    mono: true,
    size: 'medium',
  },

  layout: {
    compact: false,
    showTimestamps: true,
    showProgress: true,
  },

  animation: {
    enabled: true,
    speed: 'normal',
  },
};