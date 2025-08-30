import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Config } from '../config/ConfigLoader.js';
import { tool, Tool } from 'ai';
import * as childProcess from 'child_process';

export interface McpServerConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export type MCPTool = Tool & {
  name: string;
}

interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  serverName: string;
}

export class MCPToolLoader {
  private connections: McpConnection[] = [];
  private loadedTools: MCPTool[] = [];

  async loadMCPTools(config: Config): Promise<MCPTool[]> {
    try {
      await this.cleanup();

      if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
        console.log('📦 未配置 MCP 服务器');
        return [];
      }

      console.log('🔌 正在连接到 MCP 服务器...');
      const allTools: MCPTool[] = [];

      for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          const tools = await this.connectToServer(serverName, serverConfig);
          allTools.push(...tools);
          console.log(`✅ 已从 ${serverName} 加载 ${tools.length} 个工具`);
        } catch (error) {
          console.error(`❌ 连接到 ${serverName} 失败:`, error instanceof Error ? error.message : '未知错误');
        }
      }

      this.loadedTools = allTools;
      console.log(`🎉 总共加载了 ${allTools.length} 个 MCP 工具`);
      return allTools;
    } catch (error) {
      console.error('❌ 加载 MCP 工具失败:', error instanceof Error ? error.message : '未知错误');
      return [];
    }
  }

  private async connectToServer(serverName: string, serverConfig: McpServerConfig): Promise<MCPTool[]> {
    if (!serverConfig.command) {
      throw new Error(`MCP 服务器 ${serverName} 需要配置 command 字段`);
    }

    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: {
        ...process.env,
        ...(serverConfig.env || {})
      } as Record<string, string>
    });

    const client = new Client({
      name: 'tempurai-coder',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    try {
      await client.connect(transport);

      this.connections.push({
        client,
        transport,
        serverName
      });

      const toolsResponse = await client.listTools();
      if (!toolsResponse.tools || toolsResponse.tools.length === 0) {
        console.log(`⚠️ MCP 服务器 ${serverName} 没有提供任何工具`);
        return [];
      }

      const tools: MCPTool[] = toolsResponse.tools.map(toolInfo => {
        return this.createToolProxy(client, serverName, toolInfo);
      });

      return tools;
    } catch (error) {
      try {
        await client.close();
        await transport.close();
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  private createToolProxy(client: Client, serverName: string, toolInfo: any): MCPTool {
    // Create MCP tool in AI SDK format directly
    let t = tool({
      description: toolInfo.description || `从 MCP 服务器 ${serverName} 加载的工具`,
      inputSchema: toolInfo.inputSchema || {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async (params: any): Promise<any> => {
        try {
          const result = await client.callTool({
            name: toolInfo.name,
            arguments: params || {}
          });

          if (result.content && Array.isArray(result.content) && result.content.length > 0) {
            const textContent = result.content
              .filter((content: any) => content.type === 'text')
              .map((content: any) => content.text)
              .join('\n');

            return {
              success: true,
              content: textContent,
              raw: result
            };
          }

          return {
            success: true,
            content: '工具执行完成，但没有返回内容',
            raw: result
          };
        } catch (error) {
          console.error(`❌ MCP 工具 ${toolInfo.name} 执行失败:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误',
            content: `执行 MCP 工具 ${toolInfo.name} 时出错`
          };
        }
      }
    });

    (t as MCPTool).name = `mcp_${serverName}_${toolInfo.name}`;
    return t as MCPTool;
  }

  getLoadedTools(): MCPTool[] {
    return [...this.loadedTools];
  }

  getConnectionStatus(): { connected: number; tools: number } {
    return {
      connected: this.connections.length,
      tools: this.loadedTools.length
    };
  }

  async cleanup(): Promise<void> {
    console.log('🧹 清理 MCP 连接...');
    for (const connection of this.connections) {
      try {
        await connection.client.close();
        await connection.transport.close();
      } catch (error) {
        console.error(`清理 MCP 连接 ${connection.serverName} 时出错:`, error);
      }
    }
    this.connections = [];
    this.loadedTools = [];
  }
}

export const mcpToolLoader = new MCPToolLoader();

export async function loadMCPTools(config: Config): Promise<MCPTool[]> {
  return mcpToolLoader.loadMCPTools(config);
}