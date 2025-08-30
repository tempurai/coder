import { ThemeConfig } from '../ThemeTypes.js';

/**
 * High contrast theme for accessibility
 * Maximum contrast for vision accessibility
 */
export const highContrastTheme: ThemeConfig = {
  name: 'high-contrast',
  displayName: 'High Contrast',
  type: 'dark',
  colors: {
    primary: '#FFFFFF',      // Pure white
    secondary: '#FFFF00',    // Pure yellow
    accent: '#00FFFF',       // Pure cyan
    
    success: '#00FF00',      // Pure green
    warning: '#FFFF00',      // Pure yellow
    error: '#FF0000',        // Pure red
    info: '#00FFFF',         // Pure cyan
    
    text: {
      primary: '#FFFFFF',    // Pure white
      secondary: '#CCCCCC',  // Light gray
      muted: '#888888',      // Medium gray
      inverse: '#000000',    // Pure black
    },
    
    background: {
      primary: '#000000',    // Pure black
      secondary: '#111111',  // Very dark gray
      tertiary: '#222222',   // Dark gray
    },
    
    ui: {
      border: '#FFFFFF',     // White border
      separator: '#888888',  // Gray separator
      highlight: '#FFFF00',  // Yellow highlight
      selection: '#0000FF',  // Blue selection
      progress: '#00FF00',   // Green progress
    },
    
    tools: {
      shell: '#00FF00',      // Green
      file: '#FFFF00',       // Yellow
      git: '#FF8800',        // Orange
      web: '#FF00FF',        // Magenta
      code: '#00FFFF',       // Cyan
    },
    
    react: {
      thought: '#00FFFF',    // Cyan
      plan: '#00FF00',       // Green
      action: '#FFFF00',     // Yellow
      observation: '#FF00FF', // Magenta
    },
    
    // Syntax highlighting colors
    syntax: {
      keyword: '#FFFF00',     // Pure yellow for keywords
      string: '#00FF00',      // Pure green for strings
      function: '#00FFFF',    // Pure cyan for functions
      property: '#FF00FF',    // Pure magenta for properties
      punctuation: '#FFFFFF', // Pure white for punctuation
      comment: '#888888',     // Medium gray for comments
      number: '#FF8800',      // Orange for numbers
      operator: '#FFFF00',    // Pure yellow for operators
    },
    
    // Diff colors
    diff: {
      added: '#00FF00',       // Pure green for added lines
      removed: '#FF0000',     // Pure red for removed lines
      modified: '#FFFF00',    // Pure yellow for modified lines
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
    enabled: false, // Disable animations for accessibility
    speed: 'slow',
  },
};