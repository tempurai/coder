/**
 * Comprehensive theme system for Tempurai CLI
 */

export interface ThemeColors {
  // Primary colors
  primary: string;
  secondary: string;
  accent: string;
  
  // Status colors
  success: string;
  warning: string;
  error: string;
  info: string;
  
  // Text colors
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  
  // Background colors  
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  
  // Specific UI element colors
  ui: {
    border: string;
    separator: string;
    highlight: string;
    selection: string;
    progress: string;
  };
  
  // Tool-specific colors
  tools: {
    shell: string;
    file: string;
    git: string;
    web: string;
    code: string;
  };
  
  // ReAct flow colors
  react: {
    thought: string;
    plan: string;
    action: string;
    observation: string;
  };
  
  // Syntax highlighting colors
  syntax: {
    keyword: string;
    string: string;
    function: string;
    property: string;
    punctuation: string;
    comment: string;
    number: string;
    operator: string;
  };
  
  // Diff colors
  diff: {
    added: string;
    removed: string;
    modified: string;
  };
}

export interface ThemeConfig {
  name: string;
  displayName: string;
  type: 'dark' | 'light';
  colors: ThemeColors;
  
  // Typography
  fonts: {
    mono: boolean;
    size: 'small' | 'medium' | 'large';
  };
  
  // Layout preferences
  layout: {
    compact: boolean;
    showTimestamps: boolean;
    showProgress: boolean;
  };
  
  // Animation settings
  animation: {
    enabled: boolean;
    speed: 'slow' | 'normal' | 'fast';
  };
}

export type ThemeName = 'dark' | 'light' | 'monokai' | 'solarized' | 'dracula' | 'high-contrast';
export type ThemeRegistry = Record<ThemeName, ThemeConfig>;