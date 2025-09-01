import { ThemeConfig } from '../ThemeTypes.js';

export const lightTheme: ThemeConfig = {
  name: 'light',
  displayName: 'VS Code Light+',
  type: 'light',
  colors: {
    primary: '#0066CC',
    secondary: '#AF00DB',
    accent: '#267F99',

    success: '#28A745',
    warning: '#F57C00',
    error: '#D32F2F',
    info: '#1976D2',

    text: {
      primary: '#000000',
      secondary: '#0066CC',
      muted: '#008000',
      inverse: '#FFFFFF',
    },

    background: {
      primary: '#FFFFFF',
      secondary: '#F8F8F8',
      tertiary: '#F0F0F0',
    },

    ui: {
      border: '#E5E5E5',
      separator: '#CCCCCC',
      highlight: '#0066CC20',
      selection: '#0066CC40',
      progress: '#0066CC',
    },

    tools: {
      shell: '#28A745',
      file: '#F57C00',
      git: '#FF6B35',
      web: '#AF00DB',
      code: '#267F99',
    },

    react: {
      thought: '#1976D2',
      plan: '#28A745',
      action: '#F57C00',
      observation: '#AF00DB',
    },

    syntax: {
      keyword: '#0000FF',
      string: '#A31515',
      function: '#795E26',
      property: '#001080',
      punctuation: '#000000',
      comment: '#008000',
      number: '#098658',
      operator: '#000000',
    },

    diff: {
      added: '#28A745',
      removed: '#DC3545',
      modified: '#FFC107',
      context: '#6C757D',
      lineNumber: '#6C757D',
    },

    semantic: {
      functionCall: '#0066CC',
      parameter: '#001080',
      result: '#000000',
      metadata: '#008000',
      indicator: '#6C757D',
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