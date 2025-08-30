import { ThemeConfig } from '../ThemeTypes.js';

/**
 * Solarized Dark theme - eye-friendly coding
 * Carefully selected colors for reduced eye strain
 */
export const solarizedTheme: ThemeConfig = {
  name: 'solarized',
  displayName: 'Solarized Dark',
  type: 'dark',
  colors: {
    primary: '#268BD2',      // Blue
    secondary: '#6C71C4',    // Violet  
    accent: '#2AA198',       // Cyan
    
    success: '#859900',      // Green
    warning: '#B58900',      // Yellow
    error: '#DC322F',        // Red
    info: '#268BD2',         // Blue
    
    text: {
      primary: '#839496',    // Base0
      secondary: '#586E75',  // Base01
      muted: '#657B83',      // Base00
      inverse: '#FDF6E3',    // Base3
    },
    
    background: {
      primary: '#002B36',    // Base03
      secondary: '#073642',  // Base02
      tertiary: '#586E75',   // Base01
    },
    
    ui: {
      border: '#586E75',     // Base01
      separator: '#073642',  // Base02
      highlight: '#268BD2',  // Blue
      selection: '#073642',  // Base02
      progress: '#2AA198',   // Cyan
    },
    
    tools: {
      shell: '#859900',      // Green
      file: '#CB4B16',       // Orange
      git: '#DC322F',        // Red
      web: '#6C71C4',        // Violet
      code: '#2AA198',       // Cyan
    },
    
    react: {
      thought: '#268BD2',    // Blue
      plan: '#859900',       // Green
      action: '#B58900',     // Yellow
      observation: '#6C71C4', // Violet
    },
    
    // Syntax highlighting colors
    syntax: {
      keyword: '#859900',     // Green for keywords
      string: '#2AA198',      // Cyan for strings
      function: '#268BD2',    // Blue for functions
      property: '#CB4B16',    // Orange for properties
      punctuation: '#93A1A1', // Base1 for punctuation
      comment: '#586E75',     // Base01 for comments
      number: '#D33682',      // Magenta for numbers
      operator: '#6C71C4',    // Violet for operators
    },
    
    // Diff colors
    diff: {
      added: '#859900',       // Green for added lines
      removed: '#DC322F',     // Red for removed lines
      modified: '#B58900',    // Yellow for modified lines
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