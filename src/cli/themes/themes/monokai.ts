import { ThemeConfig } from '../ThemeTypes.js';

export const monokaiTheme: ThemeConfig = {
  name: 'monokai',
  displayName: 'Monokai Pro',
  type: 'dark',
  colors: {
    primary: '#F92672',
    secondary: '#A6E22E',
    accent: '#FD971F',

    success: '#A6E22E',
    warning: '#E6DB74',
    error: '#F92672',
    info: '#66D9EF',

    text: {
      primary: '#F8F8F2',
      secondary: '#CFCFC2',
      muted: '#75715E',
      inverse: '#272822',
    },

    background: {
      primary: '#272822',
      secondary: '#3E3D32',
      tertiary: '#49483E',
    },

    ui: {
      border: '#49483E',
      separator: '#3E3D32',
      highlight: '#49483E',
      selection: '#49483E',
      progress: '#A6E22E',
    },

    tools: {
      shell: '#A6E22E',
      file: '#E6DB74',
      git: '#FD971F',
      web: '#AE81FF',
      code: '#66D9EF',
    },

    react: {
      thought: '#66D9EF',
      plan: '#A6E22E',
      action: '#FD971F',
      observation: '#AE81FF',
    },

    syntax: {
      keyword: '#F92672',
      string: '#E6DB74',
      function: '#A6E22E',
      property: '#FD971F',
      punctuation: '#F8F8F2',
      comment: '#75715E',
      number: '#AE81FF',
      operator: '#F92672',
    },

    diff: {
      added: '#A6E22E',
      removed: '#F92672',
      modified: '#FD971F',
      context: '#75715E',
      lineNumber: '#75715E',
    },

    semantic: {
      functionCall: '#F92672',
      parameter: '#FD971F',
      result: '#F8F8F2',
      metadata: '#75715E',
      indicator: '#75715E',
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