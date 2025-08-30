import { ThemeRegistry } from '../ThemeTypes.js';
import { darkTheme } from './dark.js';
import { lightTheme } from './light.js';
import { monokaiTheme } from './monokai.js';
import { solarizedTheme } from './solarized.js';
import { draculaTheme } from './dracula.js';
import { highContrastTheme } from './high-contrast.js';

export const themes: ThemeRegistry = {
  dark: darkTheme,
  light: lightTheme,
  monokai: monokaiTheme,
  solarized: solarizedTheme,
  dracula: draculaTheme,
  'high-contrast': highContrastTheme,
};

export { darkTheme, lightTheme, monokaiTheme, solarizedTheme, draculaTheme, highContrastTheme };