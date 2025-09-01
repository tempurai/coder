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

  async loadMCPTools(config: Config): Promise<{ name: string; tool: any; category: string }[]> {
    try {
      await this.cleanup();

      if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
        console.log('📦 No MCP servers configured');
        return [];
      }

      console.log('🔌 Connecting to MCP servers...');
      const allTools: { name: string; tool: any; category: string }[] = [];

      for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          const tools = await this.connectToServer(serverName, serverConfig);
          allTools.push(...tools);
          console.log(`✅ Loaded ${tools.length} tools from ${serverName}`);
        } catch (error) {
          console.error(`❌ Failed to connect to ${serverName}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      console.log(`🎉 Total loaded ${allTools.length} MCP tools`);
      return allTools;
    } catch (error) {
      console.error('❌ Failed to load MCP tools:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  private async connectToServer(serverName: string, serverConfig: McpServerConfig): Promise<{ name: string; tool: any; category: string }[]> {
    if (!serverConfig.command) {
      throw new Error(`MCP server ${serverName} requires command field`);
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
        console.log(`⚠️ MCP server ${serverName} provides no tools`);
        return [];
      }

      const tools = toolsResponse.tools.map(toolInfo => ({
        name: `mcp_${serverName}_${toolInfo.name}`,
        tool: this.createToolProxy(client, serverName, toolInfo),
        category: 'mcp'
      }));

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

  private createToolProxy(client: Client, serverName: string, toolInfo: any): any {
    return tool({
      description: toolInfo.description || `Tool from MCP server ${serverName}`,
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
            content: 'Tool executed but returned no content',
            raw: result
          };
        } catch (error) {
          console.error(`❌ MCP tool ${toolInfo.name} execution failed:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            content: `Error executing MCP tool ${toolInfo.name}`
          };
        }
      }
    });
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up MCP connections...');
    for (const connection of this.connections) {
      try {
        await connection.client.close();
        await connection.transport.close();
      } catch (error) {
        console.error(`Error cleaning up MCP connection ${connection.serverName}:`, error);
      }
    }
    this.connections = [];
  }
}

export const mcpToolLoader = new MCPToolLoader();

export const registerMcpTools = async (registry: any, config: Config) => {
  const mcpTools = await mcpToolLoader.loadMCPTools(config);
  registry.registerMultiple(mcpTools);
};