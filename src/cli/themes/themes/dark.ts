import { ThemeConfig } from '../ThemeTypes.js';

export const darkTheme: ThemeConfig = {
  name: 'dark',
  displayName: 'VS Code Dark+',
  type: 'dark',
  colors: {
    primary: '#4FC1FF',
    secondary: '#C586C0',
    accent: '#4EC9B0',

    success: '#73C991',
    warning: '#FFCC02',
    error: '#F44747',
    info: '#75BEFF',

    text: {
      primary: '#CCCCCC',
      secondary: '#9CDCFE',
      muted: '#6A9955',
      inverse: '#1E1E1E',
    },

    background: {
      primary: '#1E1E1E',
      secondary: '#252526',
      tertiary: '#2D2D30',
    },

    ui: {
      border: '#3C3C3C',
      separator: '#2D2D30',
      highlight: '#264F78',
      selection: '#264F78',
      progress: '#0E639C',
    },

    tools: {
      shell: '#73C991',
      file: '#FFCC02',
      git: '#F97316',
      web: '#C586C0',
      code: '#4EC9B0',
    },

    react: {
      thought: '#75BEFF',
      plan: '#73C991',
      action: '#FFCC02',
      observation: '#C586C0',
    },

    syntax: {
      keyword: '#569CD6',
      string: '#CE9178',
      function: '#DCDCAA',
      property: '#9CDCFE',
      punctuation: '#D4D4D4',
      comment: '#6A9955',
      number: '#B5CEA8',
      operator: '#D4D4D4',
    },

    diff: {
      added: '#28A745',
      removed: '#DC3545',
      modified: '#FFC107',
      context: '#6C757D',
      lineNumber: '#858585',
    },

    semantic: {
      functionCall: '#4FC1FF',
      parameter: '#9CDCFE',
      result: '#D4D4D4',
      metadata: '#6A9955',
      indicator: '#858585',
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