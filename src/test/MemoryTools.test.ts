import { saveMemoryTool } from '../tools/MemoryTools.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Memory Tools', () => {
  const testDir = path.join(os.tmpdir(), 'tempurai-memory-test');
  const testContextFile = path.join(testDir, '.tempurai', '.tempurai.md');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    
    // Mock os.homedir to use test directory
    jest.spyOn(os, 'homedir').mockReturnValue(testDir);
    
    // Mock process.cwd to avoid project-local context interference
    jest.spyOn(process, 'cwd').mockReturnValue('/tmp/fake-project');
    
    // Ensure the test directory exists
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    
    // Restore mocks
    (os.homedir as jest.Mock).mockRestore();
    (process.cwd as jest.Mock).mockRestore();
  });

  describe('saveMemoryTool', () => {
    test('should create new memory file with first entry', async () => {
      const result = await (saveMemoryTool as any).execute({
        content: 'Our test command is npm run test:ci',
        category: 'Commands',
        ask_permission: false // Skip permission for testing
      }, {}) as any;

      expect(result.success).toBe(true);
      expect(result.message).toBe('Information successfully saved to long-term memory');
      expect(result.category).toBe('Commands');
      expect(result.content).toBe('Our test command is npm run test:ci');

      // Check file was created with correct content
      expect(fs.existsSync(testContextFile)).toBe(true);
      const content = fs.readFileSync(testContextFile, 'utf8');
      
      expect(content).toContain('## Long-term Memory');
      expect(content).toContain('### Commands');
      expect(content).toContain('Our test command is npm run test:ci');
      expect(content).toMatch(/\*\*Added on \d{4}-\d{2}-\d{2}:\*\*/);
    });

    test('should append to existing memory file', async () => {
      // Create initial memory file
      const initialContent = `# Tempurai Custom Context

This is existing content.

## Long-term Memory

This section contains important information.

### Commands

**Added on 2024-01-01:**
Previous command info
`;
      
      fs.mkdirSync(path.dirname(testContextFile), { recursive: true });
      fs.writeFileSync(testContextFile, initialContent, 'utf8');

      // Add new memory
      const result = await (saveMemoryTool as any).execute({
        content: 'New important information about build process',
        category: 'Build',
        ask_permission: false
      }, {}) as any;

      expect(result.success).toBe(true);

      // Check content was appended correctly
      const updatedContent = fs.readFileSync(testContextFile, 'utf8');
      
      expect(updatedContent).toContain('This is existing content.'); // Original content preserved
      expect(updatedContent).toContain('Previous command info'); // Original memory preserved
      expect(updatedContent).toContain('### Build'); // New category added
      expect(updatedContent).toContain('New important information about build process'); // New content added
    });

    test('should handle memory without category', async () => {
      const result = await (saveMemoryTool as any).execute({
        content: 'General important fact',
        ask_permission: false
      }, {}) as any;

      expect(result.success).toBe(true);
      expect(result.category).toBe('General');

      const content = fs.readFileSync(testContextFile, 'utf8');
      expect(content).toContain('### Saved Memories'); // Default category
      expect(content).toContain('General important fact');
    });

    test('should create directory if it does not exist', async () => {
      // Clean up and verify directory doesn't exist
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
      expect(fs.existsSync(testDir)).toBe(false);

      const result = await (saveMemoryTool as any).execute({
        content: 'Test content',
        ask_permission: false
      }, {}) as any;

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.tempurai'))).toBe(true);
      expect(fs.existsSync(testContextFile)).toBe(true);
    });

    test('should handle file system errors gracefully', async () => {
      // Mock fs.writeFileSync to throw an error
      const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await (saveMemoryTool as any).execute({
        content: 'Test content',
        ask_permission: false
      }, {}) as any;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(result.message).toBe('Could not save information to long-term memory');

      // Restore mock
      writeFileSyncSpy.mockRestore();
    });

    test('should prefer project-local context file when available', async () => {
      const projectDir = '/tmp/fake-project';
      const projectTempuraiDir = path.join(projectDir, '.tempurai');
      const projectContextFile = path.join(projectTempuraiDir, 'directives.md');

      // Mock process.cwd to return our test project directory
      (process.cwd as jest.Mock).mockReturnValue(projectDir);

      // Create project .tempurai directory
      fs.mkdirSync(projectTempuraiDir, { recursive: true });

      const result = await (saveMemoryTool as any).execute({
        content: 'Project-specific memory',
        ask_permission: false
      }, {}) as any;

      expect(result.success).toBe(true);
      expect(result.file_path).toBe(projectContextFile);
      expect(fs.existsSync(projectContextFile)).toBe(true);
      
      const content = fs.readFileSync(projectContextFile, 'utf8');
      expect(content).toContain('Project-specific memory');

      // Clean up project directory
      fs.rmSync(projectTempuraiDir, { recursive: true, force: true });
    });

    test('should include timestamp in memory entry', async () => {
      const result = await (saveMemoryTool as any).execute({
        content: 'Timestamped memory',
        ask_permission: false
      }, {}) as any;

      expect(result.success).toBe(true);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const content = fs.readFileSync(testContextFile, 'utf8');
      expect(content).toContain(`**Added on ${result.timestamp}:**`);
    });
  });

  describe('Memory Integration', () => {
    test('should demonstrate typical usage flow', async () => {
      // Simulate user telling AI important information
      const commands = [
        {
          content: 'Our test command is npm run test:ci',
          category: 'Commands'
        },
        {
          content: 'Always use TypeScript strict mode in this project',
          category: 'Coding Standards'
        },
        {
          content: 'Database connection string is in .env.local file',
          category: 'Configuration'
        }
      ];

      // Save all memories
      for (const cmd of commands) {
        const result = await (saveMemoryTool as any).execute({
          content: cmd.content,
          category: cmd.category,
          ask_permission: false
        }, {}) as any;
        expect(result.success).toBe(true);
      }

      // Verify all memories are saved correctly
      const content = fs.readFileSync(testContextFile, 'utf8');
      
      expect(content).toContain('## Long-term Memory');
      expect(content).toContain('### Commands');
      expect(content).toContain('npm run test:ci');
      expect(content).toContain('### Coding Standards');
      expect(content).toContain('TypeScript strict mode');
      expect(content).toContain('### Configuration');
      expect(content).toContain('Database connection string');
    });
  });
});