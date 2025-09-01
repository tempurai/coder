import { ThemeConfig } from '../ThemeTypes.js';

export const solarizedTheme: ThemeConfig = {
  name: 'solarized',
  displayName: 'Solarized Dark',
  type: 'dark',
  colors: {
    primary: '#268BD2',
    secondary: '#6C71C4',
    accent: '#2AA198',

    success: '#859900',
    warning: '#B58900',
    error: '#DC322F',
    info: '#268BD2',

    text: {
      primary: '#839496',
      secondary: '#93A1A1',
      muted: '#586E75',
      inverse: '#FDF6E3',
    },

    background: {
      primary: '#002B36',
      secondary: '#073642',
      tertiary: '#586E75',
    },

    ui: {
      border: '#586E75',
      separator: '#073642',
      highlight: '#268BD2',
      selection: '#073642',
      progress: '#2AA198',
    },

    tools: {
      shell: '#859900',
      file: '#CB4B16',
      git: '#DC322F',
      web: '#6C71C4',
      code: '#2AA198',
    },

    react: {
      thought: '#268BD2',
      plan: '#859900',
      action: '#B58900',
      observation: '#6C71C4',
    },

    syntax: {
      keyword: '#859900',
      string: '#2AA198',
      function: '#268BD2',
      property: '#CB4B16',
      punctuation: '#93A1A1',
      comment: '#586E75',
      number: '#D33682',
      operator: '#6C71C4',
    },

    diff: {
      added: '#859900',
      removed: '#DC322F',
      modified: '#B58900',
      context: '#586E75',
      lineNumber: '#586E75',
    },

    semantic: {
      functionCall: '#268BD2',
      parameter: '#CB4B16',
      result: '#839496',
      metadata: '#586E75',
      indicator: '#586E75',
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