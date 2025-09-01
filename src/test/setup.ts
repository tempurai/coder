import 'reflect-metadata';
import * as path from 'path';
import * as os from 'os';

// Mock ConfigInitializer globally to avoid import.meta.url issues in Jest
jest.mock('../config/ConfigInitializer.js', () => {
  return {
    ConfigInitializer: jest.fn().mockImplementation(() => ({
      globalConfigExists: jest.fn().mockReturnValue(true),
      projectConfigExists: jest.fn().mockReturnValue(true),
      createGlobalFiles: jest.fn(),
      createProjectFiles: jest.fn(),
      initializeGlobalFiles: jest.fn(),
      getConfigDir: jest.fn().mockReturnValue(path.join(os.homedir(), '.tempurai')),
      getConfigPath: jest.fn().mockReturnValue(path.join(os.homedir(), '.tempurai', 'config.json')),
      getContextPath: jest.fn().mockReturnValue(path.join(os.homedir(), '.tempurai', '.tempurai.md'))
    }))
  };
});

// Mock console methods during tests to avoid noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';

// Global test timeout
jest.setTimeout(30000);