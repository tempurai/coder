import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Config } from '../config/ConfigLoader';
import * as childProcess from 'child_process';

/**
 * MCP 服务器配置接口
 */
export interface McpServerConfig {
  /** 服务器名称 */
  name: string;
  /** 启动命令（用于 stdio 传输） */
  command?: string;
  /** 命令参数 */
  args?: string[];
  /** HTTP URL（用于 HTTP 传输） */
  url?: string;
  /** 环境变量 */
  env?: Record<string, string>;
}

/**
 * MCP 工具的类型定义
 */
export interface McpTool {
  id: string;
  name: string;
  description: string;
  parameters: any;
  execute: (params: any) => Promise<any>;
}

/**
 * MCP 客户端连接信息
 */
interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  serverName: string;
}

/**
 * MCP 工具加载器类
 * 负责连接到外部 MCP 服务器并动态加载工具
 */
export class McpToolLoader {
  private connections: McpConnection[] = [];
  private loadedTools: McpTool[] = [];

  /**
   * 从配置中加载所有 MCP 服务器的工具
   * @param config 应用配置
   * @returns Promise<McpTool[]> 加载的工具列表
   */
  async loadMcpTools(config: Config): Promise<McpTool[]> {
    try {
      // 清理之前的连接
      await this.cleanup();

      if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
        console.log('📦 未配置 MCP 服务器');
        return [];
      }

      console.log('🔌 正在连接到 MCP 服务器...');

      const allTools: McpTool[] = [];

      // 连接到每个配置的 MCP 服务器
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

  /**
   * 连接到单个 MCP 服务器并获取其工具
   * @param serverName 服务器名称
   * @param serverConfig 服务器配置
   * @returns Promise<McpTool[]> 该服务器提供的工具列表
   */
  private async connectToServer(serverName: string, serverConfig: McpServerConfig): Promise<McpTool[]> {
    // 目前只支持 stdio 传输，HTTP 传输可以后续添加
    if (!serverConfig.command) {
      throw new Error(`MCP 服务器 ${serverName} 需要配置 command 字段`);
    }

    // 创建 stdio 传输
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: {
        ...process.env,
        ...(serverConfig.env || {})
      } as Record<string, string>
    });

    // 创建客户端
    const client = new Client({
      name: 'tempurai-coder',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    try {
      // 连接到服务器
      await client.connect(transport);

      // 保存连接信息
      this.connections.push({
        client,
        transport,
        serverName
      });

      // 列出服务器提供的工具
      const toolsResponse = await client.listTools();
      
      if (!toolsResponse.tools || toolsResponse.tools.length === 0) {
        console.log(`⚠️ MCP 服务器 ${serverName} 没有提供任何工具`);
        return [];
      }

      // 为每个工具创建代理
      const tools: McpTool[] = toolsResponse.tools.map(toolInfo => {
        return this.createToolProxy(client, serverName, toolInfo);
      });

      return tools;
    } catch (error) {
      // 如果连接失败，清理资源
      try {
        await client.close();
        await transport.close();
      } catch (cleanupError) {
        // 忽略清理错误
      }
      throw error;
    }
  }

  /**
   * 为远程工具创建本地代理
   * @param client MCP 客户端
   * @param serverName 服务器名称
   * @param toolInfo 工具信息
   * @returns McpTool 代理工具
   */
  private createToolProxy(client: Client, serverName: string, toolInfo: any): McpTool {
    return {
      id: `mcp_${serverName}_${toolInfo.name}`,
      name: toolInfo.name,
      description: toolInfo.description || `从 MCP 服务器 ${serverName} 加载的工具`,
      parameters: toolInfo.inputSchema || {
        type: 'object',
        properties: {},
        required: []
      },

      /**
       * 执行远程工具调用
       * @param params 工具参数
       * @returns Promise<any> 工具执行结果
       */
      async execute(params: any): Promise<any> {
        try {
          // 调用远程工具
          const result = await client.callTool({
            name: toolInfo.name,
            arguments: params || {}
          });

          // 返回工具的输出内容
          if (result.content && Array.isArray(result.content) && result.content.length > 0) {
            // MCP 工具可能返回多个内容块，我们合并它们
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
    };
  }

  /**
   * 获取已加载的工具列表
   * @returns McpTool[] 已加载的工具
   */
  getLoadedTools(): McpTool[] {
    return [...this.loadedTools];
  }

  /**
   * 获取连接状态统计
   * @returns 连接状态信息
   */
  getConnectionStatus(): { connected: number; tools: number } {
    return {
      connected: this.connections.length,
      tools: this.loadedTools.length
    };
  }

  /**
   * 清理所有连接和资源
   */
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

/**
 * 全局 MCP 工具加载器实例
 */
export const mcpToolLoader = new McpToolLoader();

/**
 * 便捷的工具加载函数
 * @param config 应用配置
 * @returns Promise<McpTool[]> 加载的 MCP 工具
 */
export async function loadMcpTools(config: Config): Promise<McpTool[]> {
  return mcpToolLoader.loadMcpTools(config);
}