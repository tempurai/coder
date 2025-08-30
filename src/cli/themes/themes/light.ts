import { ThemeConfig } from '../ThemeTypes.js';

/**
 * Light theme for daytime coding
 * Clean whites and subtle colors
 */
export const lightTheme: ThemeConfig = {
  name: 'light',
  displayName: 'Light Clean',
  type: 'light',
  colors: {
    primary: '#2563EB',      // Blue
    secondary: '#7C3AED',    // Purple
    accent: '#059669',       // Emerald
    
    success: '#16A34A',      // Green
    warning: '#D97706',      // Amber
    error: '#DC2626',        // Red
    info: '#2563EB',         // Blue
    
    text: {
      primary: '#0F172A',    // Dark
      secondary: '#475569',  // Gray
      muted: '#94A3B8',      // Light gray
      inverse: '#F8FAFC',    // Light
    },
    
    background: {
      primary: '#FFFFFF',    // White
      secondary: '#F8FAFC',  // Off white
      tertiary: '#F1F5F9',   // Light gray
    },
    
    ui: {
      border: '#E2E8F0',     // Border gray
      separator: '#CBD5E1',  // Separator
      highlight: '#DBEAFE',  // Highlight blue
      selection: '#BFDBFE',  // Selection blue
      progress: '#2563EB',   // Progress blue
    },
    
    tools: {
      shell: '#16A34A',      // Green for shell
      file: '#D97706',       // Amber for files  
      git: '#EA580C',        // Orange for git
      web: '#7C3AED',        // Purple for web
      code: '#059669',       // Emerald for code
    },
    
    react: {
      thought: '#2563EB',    // Blue for thoughts
      plan: '#16A34A',       // Green for plans
      action: '#D97706',     // Amber for actions
      observation: '#7C3AED', // Purple for observations
    },
    
    // Syntax highlighting colors
    syntax: {
      keyword: '#DC2626',     // Red for keywords
      string: '#16A34A',      // Green for strings
      function: '#2563EB',    // Blue for functions
      property: '#7C3AED',    // Purple for properties
      punctuation: '#64748B', // Slate for punctuation
      comment: '#94A3B8',     // Light gray for comments
      number: '#EA580C',      // Orange for numbers
      operator: '#059669',    // Emerald for operators
    },
    
    // Diff colors
    diff: {
      added: '#16A34A',       // Green for added lines
      removed: '#DC2626',     // Red for removed lines
      modified: '#D97706',    // Amber for modified lines
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