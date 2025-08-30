import { ThemeConfig } from '../ThemeTypes.js';

/**
 * Dark theme inspired by Claude Code
 * Deep blues and high contrast for professional development
 */
export const darkTheme: ThemeConfig = {
  name: 'dark',
  displayName: 'Claude Dark',
  type: 'dark',
  colors: {
    primary: '#0EA5E9',      // Sky blue
    secondary: '#8B5CF6',    // Purple  
    accent: '#06D6A0',       // Teal
    
    success: '#10B981',      // Green
    warning: '#F59E0B',      // Amber
    error: '#EF4444',        // Red
    info: '#3B82F6',         // Blue
    
    text: {
      primary: '#F8FAFC',    // Near white
      secondary: '#CBD5E1',  // Light gray
      muted: '#64748B',      // Medium gray
      inverse: '#0F172A',    // Dark
    },
    
    background: {
      primary: '#0F172A',    // Very dark blue
      secondary: '#1E293B',  // Dark blue  
      tertiary: '#334155',   // Medium blue
    },
    
    ui: {
      border: '#475569',     // Border gray
      separator: '#334155',  // Separator
      highlight: '#1E40AF',  // Highlight blue
      selection: '#1D4ED8',  // Selection blue
      progress: '#0EA5E9',   // Progress blue
    },
    
    tools: {
      shell: '#10B981',      // Green for shell
      file: '#F59E0B',       // Amber for files
      git: '#F97316',        // Orange for git
      web: '#8B5CF6',        // Purple for web
      code: '#06D6A0',       // Teal for code
    },
    
    react: {
      thought: '#3B82F6',    // Blue for thoughts
      plan: '#10B981',       // Green for plans
      action: '#F59E0B',     // Amber for actions
      observation: '#8B5CF6', // Purple for observations
    },
    
    // Syntax highlighting colors
    syntax: {
      keyword: '#FF7F7F',     // Light red/pink for keywords
      string: '#90EE90',      // Light green for strings
      function: '#87CEEB',    // Sky blue for functions
      property: '#FFB6C1',    // Light pink for properties
      punctuation: '#D3D3D3', // Light gray for punctuation
      comment: '#696969',     // Dim gray for comments
      number: '#FFA07A',      // Light salmon for numbers
      operator: '#DDA0DD',    // Plum for operators
    },
    
    // Diff colors
    diff: {
      added: '#22C55E',       // Green for added lines
      removed: '#EF4444',     // Red for removed lines
      modified: '#F59E0B',    // Amber for modified lines
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