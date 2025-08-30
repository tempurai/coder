import { ThemeConfig } from '../ThemeTypes.js';

/**
 * Dracula theme - dark with vibrant purples
 * Popular theme with high contrast
 */
export const draculaTheme: ThemeConfig = {
  name: 'dracula',
  displayName: 'Dracula',
  type: 'dark',
  colors: {
    primary: '#BD93F9',      // Purple
    secondary: '#8BE9FD',    // Cyan
    accent: '#50FA7B',       // Green
    
    success: '#50FA7B',      // Green
    warning: '#F1FA8C',      // Yellow
    error: '#FF5555',        // Red
    info: '#8BE9FD',         // Cyan
    
    text: {
      primary: '#F8F8F2',    // Foreground
      secondary: '#6272A4',  // Comment
      muted: '#44475A',      // Current line
      inverse: '#282A36',    // Background
    },
    
    background: {
      primary: '#282A36',    // Background
      secondary: '#44475A',  // Current line
      tertiary: '#6272A4',   // Comment
    },
    
    ui: {
      border: '#6272A4',     // Comment
      separator: '#44475A',  // Current line
      highlight: '#BD93F9',  // Purple
      selection: '#44475A',  // Current line
      progress: '#50FA7B',   // Green
    },
    
    tools: {
      shell: '#50FA7B',      // Green
      file: '#F1FA8C',       // Yellow
      git: '#FFB86C',        // Orange
      web: '#BD93F9',        // Purple
      code: '#8BE9FD',       // Cyan
    },
    
    react: {
      thought: '#8BE9FD',    // Cyan
      plan: '#50FA7B',       // Green
      action: '#FFB86C',     // Orange
      observation: '#BD93F9', // Purple
    },
    
    // Syntax highlighting colors
    syntax: {
      keyword: '#FF79C6',     // Pink for keywords
      string: '#F1FA8C',      // Yellow for strings
      function: '#50FA7B',    // Green for functions
      property: '#8BE9FD',    // Cyan for properties
      punctuation: '#F8F8F2', // Foreground for punctuation
      comment: '#6272A4',     // Comment color for comments
      number: '#BD93F9',      // Purple for numbers
      operator: '#FF79C6',    // Pink for operators
    },
    
    // Diff colors
    diff: {
      added: '#50FA7B',       // Green for added lines
      removed: '#FF5555',     // Red for removed lines
      modified: '#FFB86C',    // Orange for modified lines
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