import { ConfigLoader } from '../config/ConfigLoader.js';
import { ConfigInitializer } from '../config/ConfigInitializer.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigLoader Enhanced Initialization', () => {
  const testConfigDir = path.join(os.tmpdir(), '.tempurai');
  const testConfigFile = path.join(testConfigDir, 'config.json');
  const testContextFile = path.join(testConfigDir, '.tempurai.md');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('Static Initialization', () => {
    test('should initialize configuration on first startup', async () => {
      // Mock the home directory for this test
      jest.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());

      try {
        await ConfigLoader.initializeConfigOnStartup();

        // Check if config file was created
        expect(fs.existsSync(testConfigFile)).toBe(true);

        // Check if config file has standard content
        const configContent = fs.readFileSync(testConfigFile, 'utf8');
        expect(configContent).toContain('gpt-4o-mini');
        expect(configContent).toContain('0.3');

        // Check if context file was created
        expect(fs.existsSync(testContextFile)).toBe(true);
        const contextContent = fs.readFileSync(testContextFile, 'utf8');
        expect(contextContent).toContain('# Tempurai Custom Context');
      } finally {
        (os.homedir as jest.Mock).mockRestore();
      }
    });

    test('should not recreate config if it already exists', async () => {
      // Mock the home directory for this test
      jest.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());

      try {
        // Create config directory and file first
        fs.mkdirSync(testConfigDir, { recursive: true });
        fs.writeFileSync(testConfigFile, '{"model": "existing"}', 'utf8');
        const originalContent = fs.readFileSync(testConfigFile, 'utf8');

        await ConfigLoader.initializeConfigOnStartup();

        // File should not have been overwritten
        const newContent = fs.readFileSync(testConfigFile, 'utf8');
        expect(newContent).toBe(originalContent);
      } finally {
        (os.homedir as jest.Mock).mockRestore();
      }
    });
  });

  describe('ConfigInitializer Direct Tests', () => {
    test('should create config files with ConfigInitializer', async () => {
      // Mock the home directory for this test
      jest.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());

      try {
        const initializer = new ConfigInitializer();
        await initializer.initializeConfig();

        // Check if config file was created
        expect(fs.existsSync(testConfigFile)).toBe(true);

        // Check if context file was created
        expect(fs.existsSync(testContextFile)).toBe(true);
        const contextContent = fs.readFileSync(testContextFile, 'utf8');
        expect(contextContent).toContain('# Tempurai Custom Context');
        expect(contextContent).toContain('Coding Style Preferences');
        expect(contextContent).toContain('Project-Specific Guidelines');
        expect(contextContent).toContain('Personal Preferences');
        expect(contextContent).toContain('./.tempurai/directives.md');
      } finally {
        (os.homedir as jest.Mock).mockRestore();
      }
    });

    test('should detect existing config', () => {
      // Mock the home directory for this test
      jest.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());

      try {
        // Create config first
        fs.mkdirSync(testConfigDir, { recursive: true });
        fs.writeFileSync(testConfigFile, '{"model": "test"}', 'utf8');

        const initializer = new ConfigInitializer();
        expect(initializer.configExists()).toBe(true);
      } finally {
        (os.homedir as jest.Mock).mockRestore();
      }
    });

    test('should create config synchronously', () => {
      // Mock the home directory for this test
      jest.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());

      try {
        const initializer = new ConfigInitializer();
        initializer.createConfigSync();

        // Check if config file was created (but not context file)
        expect(fs.existsSync(testConfigFile)).toBe(true);
        
        const configContent = fs.readFileSync(testConfigFile, 'utf8');
        expect(configContent).toContain('gpt-4o-mini');
      } finally {
        (os.homedir as jest.Mock).mockRestore();
      }
    });
  });
});