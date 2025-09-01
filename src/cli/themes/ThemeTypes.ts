export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  ui: {
    border: string;
    separator: string;
    highlight: string;
    selection: string;
    progress: string;
  };
  tools: {
    shell: string;
    file: string;
    git: string;
    web: string;
    code: string;
  };
  react: {
    thought: string;
    plan: string;
    action: string;
    observation: string;
  };
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
  diff: {
    added: string;
    removed: string;
    modified: string;
    context: string;
    lineNumber: string;
  };
  semantic: {
    functionCall: string;
    parameter: string;
    result: string;
    metadata: string;
    indicator: string;
  };
}

export interface ThemeConfig {
  name: string;
  displayName: string;
  type: 'dark' | 'light';
  colors: ThemeColors;
  fonts: {
    mono: boolean;
    size: 'small' | 'medium' | 'large';
  };
  layout: {
    compact: boolean;
    showTimestamps: boolean;
    showProgress: boolean;
  };
  animation: {
    enabled: boolean;
    speed: 'slow' | 'normal' | 'fast';
  };
}

export type ThemeName = 'dark' | 'light' | 'monokai' | 'solarized' | 'dracula' | 'high-contrast';
export type ThemeRegistry = Record<ThemeName, ThemeConfig>;