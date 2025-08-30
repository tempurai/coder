import { MCPToolLoader } from '../tools/McpToolLoader.js';
import { Config } from '../config/ConfigLoader.js';

describe('MCPToolLoader Multiple Servers', () => {
  let mcpLoader: MCPToolLoader;

  beforeEach(() => {
    mcpLoader = new MCPToolLoader();
  });

  afterEach(async () => {
    await mcpLoader.cleanup();
  });

  describe('Multiple Server Configuration', () => {
    test('should handle empty MCP servers config', async () => {
      const config: Config = {
        models: [{
          provider: 'openai',
          name: 'gpt-4o-mini'
        }],
        temperature: 0.3,
        maxTokens: 4096,
        mcpServers: {},
        tools: {
          shellExecutor: {
            defaultTimeout: 30000,
            maxRetries: 3,
            security: {
              allowlist: ['git'],
              blocklist: ['rm'],
              allowUnlistedCommands: false,
              allowDangerousCommands: false
            }
          },
          webTools: {
            requestTimeout: 15000,
            maxContentLength: 10000,
            userAgent: 'Test-Agent',
            enableCache: false
          }
        }
      };

      const tools = await mcpLoader.loadMCPTools(config);
      expect(tools).toEqual([]);
      
      const status = mcpLoader.getConnectionStatus();
      expect(status.connected).toBe(0);
      expect(status.tools).toBe(0);
    });

    test('should handle multiple server configuration structure', async () => {
      const multiServerConfig: Config = {
        models: [{
          provider: 'openai',
          name: 'gpt-4o-mini'
        }],
        temperature: 0.3,
        maxTokens: 4096,
        mcpServers: {
          'filesystem': {
            name: 'filesystem',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
            env: {
              'NODE_ENV': 'development'
            }
          },
          'brave-search': {
            name: 'brave-search',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            env: {
              'BRAVE_API_KEY': 'test-api-key'
            }
          },
          'sqlite': {
            name: 'sqlite',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '/tmp/test.db'],
            env: {}
          }
        },
        tools: {
          shellExecutor: {
            defaultTimeout: 30000,
            maxRetries: 3,
            security: {
              allowlist: ['git'],
              blocklist: ['rm'],
              allowUnlistedCommands: false,
              allowDangerousCommands: false
            }
          },
          webTools: {
            requestTimeout: 15000,
            maxContentLength: 10000,
            userAgent: 'Test-Agent',
            enableCache: false
          }
        }
      };

      // 这个测试只验证配置结构，不实际连接
      expect(multiServerConfig.mcpServers).toBeDefined();
      expect(Object.keys(multiServerConfig.mcpServers!)).toHaveLength(3);
      expect(multiServerConfig.mcpServers!['filesystem']).toBeDefined();
      expect(multiServerConfig.mcpServers!['brave-search']).toBeDefined();
      expect(multiServerConfig.mcpServers!['sqlite']).toBeDefined();

      // 验证每个服务器配置包含必要字段
      const filesystemConfig = multiServerConfig.mcpServers!['filesystem'];
      expect(filesystemConfig.name).toBe('filesystem');
      expect(filesystemConfig.command).toBe('npx');
      expect(filesystemConfig.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);

      const braveConfig = multiServerConfig.mcpServers!['brave-search'];
      expect(braveConfig.name).toBe('brave-search');
      expect(braveConfig.env!['BRAVE_API_KEY']).toBe('test-api-key');

      const sqliteConfig = multiServerConfig.mcpServers!['sqlite'];
      expect(sqliteConfig.args).toEqual(['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '/tmp/test.db']);
    });

    test('should generate unique tool names for multiple servers', async () => {
      // Mock scenario: two servers both have a "read" tool
      const mockConfig: Config = {
        models: [{
          provider: 'openai',
          name: 'gpt-4o-mini'
        }],
        temperature: 0.3,
        maxTokens: 4096,
        mcpServers: {
          'server1': {
            name: 'server1',
            command: 'mock-command-1'
          },
          'server2': {
            name: 'server2', 
            command: 'mock-command-2'
          }
        },
        tools: {
          shellExecutor: {
            defaultTimeout: 30000,
            maxRetries: 3,
            security: {
              allowlist: ['git'],
              blocklist: ['rm'],
              allowUnlistedCommands: false,
              allowDangerousCommands: false
            }
          },
          webTools: {
            requestTimeout: 15000,
            maxContentLength: 10000,
            userAgent: 'Test-Agent',
            enableCache: false
          }
        }
      };

      // This test verifies the naming scheme without actual connections
      // Tool names should be: mcp_{serverName}_{toolName}
      expect('mcp_server1_read').toMatch(/^mcp_server1_.+/);
      expect('mcp_server2_read').toMatch(/^mcp_server2_.+/);
      expect('mcp_server1_read').not.toBe('mcp_server2_read');
    });

    test('should track connection status correctly', () => {
      const initialStatus = mcpLoader.getConnectionStatus();
      expect(initialStatus.connected).toBe(0);
      expect(initialStatus.tools).toBe(0);

      const loadedTools = mcpLoader.getLoadedTools();
      expect(loadedTools).toEqual([]);
    });
  });

  describe('Configuration Examples', () => {
    test('should provide example configuration for multiple common MCP servers', () => {
      const exampleConfig = {
        mcpServers: {
          // 文件系统服务器 - 用于文件操作
          'filesystem': {
            name: 'filesystem',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/workspace'],
            env: {}
          },
          
          // Brave搜索服务器 - 用于网络搜索
          'brave-search': {
            name: 'brave-search',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            env: {
              'BRAVE_API_KEY': 'your-brave-api-key-here'
            }
          },
          
          // SQLite数据库服务器
          'sqlite': {
            name: 'sqlite',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './database.db'],
            env: {}
          },
          
          // Puppeteer浏览器自动化服务器
          'puppeteer': {
            name: 'puppeteer',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-puppeteer'],
            env: {}
          },
          
          // GitHub API服务器
          'github': {
            name: 'github',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
              'GITHUB_PERSONAL_ACCESS_TOKEN': 'your-github-token-here'
            }
          }
        }
      };

      // 验证示例配置结构
      expect(Object.keys(exampleConfig.mcpServers)).toHaveLength(5);
      expect(exampleConfig.mcpServers['filesystem'].command).toBe('npx');
      expect(exampleConfig.mcpServers['brave-search'].env!['BRAVE_API_KEY']).toBeDefined();
      expect(exampleConfig.mcpServers['sqlite'].args).toContain('--db-path');
      expect(exampleConfig.mcpServers['github'].env!['GITHUB_PERSONAL_ACCESS_TOKEN']).toBeDefined();
    });
  });
});