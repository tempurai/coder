import { ThemeConfig } from '../ThemeTypes.js';

/**
 * Monokai theme - classic dark coding theme
 * Warm colors on dark background
 */
export const monokaiTheme: ThemeConfig = {
  name: 'monokai',
  displayName: 'Monokai Pro',
  type: 'dark',
  colors: {
    primary: '#F92672',      // Magenta
    secondary: '#A6E22E',    // Green
    accent: '#FD971F',       // Orange
    
    success: '#A6E22E',      // Green
    warning: '#E6DB74',      // Yellow
    error: '#F92672',        // Magenta
    info: '#66D9EF',         // Cyan
    
    text: {
      primary: '#F8F8F2',    // Off white
      secondary: '#CFCFC2',  // Light gray
      muted: '#75715E',      // Brown gray
      inverse: '#272822',    // Dark
    },
    
    background: {
      primary: '#272822',    // Dark green
      secondary: '#3E3D32',  // Darker green
      tertiary: '#49483E',   // Medium green
    },
    
    ui: {
      border: '#49483E',     // Border
      separator: '#3E3D32',  // Separator
      highlight: '#F92672',  // Magenta highlight
      selection: '#49483E',  // Selection
      progress: '#A6E22E',   // Green progress
    },
    
    tools: {
      shell: '#A6E22E',      // Green
      file: '#E6DB74',       // Yellow
      git: '#FD971F',        // Orange
      web: '#AE81FF',        // Purple
      code: '#66D9EF',       // Cyan
    },
    
    react: {
      thought: '#66D9EF',    // Cyan
      plan: '#A6E22E',       // Green
      action: '#FD971F',     // Orange
      observation: '#AE81FF', // Purple
    },
    
    // Syntax highlighting colors
    syntax: {
      keyword: '#F92672',     // Pink for keywords
      string: '#E6DB74',      // Yellow for strings
      function: '#A6E22E',    // Green for functions
      property: '#FD971F',    // Orange for properties
      punctuation: '#F8F8F2', // White for punctuation
      comment: '#75715E',     // Gray for comments
      number: '#AE81FF',      // Purple for numbers
      operator: '#F92672',    // Pink for operators
    },
    
    // Diff colors
    diff: {
      added: '#A6E22E',       // Green for added lines
      removed: '#F92672',     // Pink for removed lines
      modified: '#FD971F',    // Orange for modified lines
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