import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ThemeConfig, ThemeName } from './ThemeTypes.js';
import { themes } from './themes/index.js';

interface ThemeContextType {
  currentTheme: ThemeConfig;
  themeName: ThemeName;
  setTheme: (themeName: ThemeName) => void;
  availableThemes: ThemeName[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeName;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultTheme = 'dark' 
}) => {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme);
  const currentTheme = themes[themeName];
  const availableThemes = Object.keys(themes) as ThemeName[];

  const setTheme = (newThemeName: ThemeName) => {
    if (themes[newThemeName]) {
      setThemeName(newThemeName);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, themeName, setTheme, availableThemes }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};