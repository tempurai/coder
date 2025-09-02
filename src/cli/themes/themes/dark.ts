import { ThemeConfig } from '../ThemeTypes.js';

export const darkTheme: ThemeConfig = {
  name: 'dark',
  displayName: 'VS Code Dark+ (CLI tuned)',
  type: 'dark',
  colors: {
    primary: '#FEFEFE',
    secondary: '#C586C0',
    accent: '#ef4444',

    success: '#73C991',
    warning: '#FFCC02',
    error: '#F44747',
    info: '#75BEFF',

    text: {
      primary: '#FAFAFA', // 主文字，接近白
      secondary: '#DDDDDD', // 次级文字，冷灰蓝
      muted: '#A0A0A0', // 中性灰
      inverse: '#1E1E1E', // 反转用
    },

    background: {
      primary: '#1E1E1E',
      secondary: '#242526',
      tertiary: '#2B2B2F',
    },

    ui: {
      border: '#5A5A5A',
      separator: '#464646',
      highlight: '#347FD1',
      selection: '#347FD1',
      progress: '#1292E5',
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
      comment: '#7F8C8D',
      number: '#B5CEA8',
      operator: '#D4D4D4',
    },

    diff: {
      added: '#2FBF71',
      removed: '#E24A4A',
      modified: '#FFC83A',
      context: '#8A8F98',
      lineNumber: '#909090',
    },

    semantic: {
      functionCall: '#e7f8f2',
      parameter: '#9CDCFE',
      result: '#E0E0E0',
      metadata: '#8A8A8A',
      indicator: '#8D8D8D',
    },
  },

  fonts: { mono: true, size: 'medium' },

  layout: {
    compact: false,
    showTimestamps: true,
    showProgress: true,
  },

  animation: { enabled: true, speed: 'normal' },
};
