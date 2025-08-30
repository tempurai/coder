# Multiple MCP Server Configuration Guide

Tempurai已经内置支持多个Model Context Protocol (MCP)服务器。你可以同时配置多个服务器来扩展AI助手的功能。

## 🔧 配置结构

在你的`~/.tempurai/config.json`文件中，`mcpServers`是一个对象，其中：
- **键**：服务器名称（自定义的唯一标识符）
- **值**：服务器配置对象

```json
{
  "mcpServers": {
    "server_name_1": {
      "name": "server_name_1",
      "command": "command_to_run",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      }
    },
    "server_name_2": {
      "name": "server_name_2", 
      "command": "another_command",
      "args": ["different_args"]
    }
  }
}
```

## 🌟 常用MCP服务器配置示例

### 1. 文件系统服务器
提供文件读写、目录遍历等功能
```json
"filesystem": {
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/your/workspace"]
}
```

### 2. Brave搜索服务器  
提供网络搜索功能
```json
"brave-search": {
  "name": "brave-search",
  "command": "npx", 
  "args": ["-y", "@modelcontextprotocol/server-brave-search"],
  "env": {
    "BRAVE_API_KEY": "your-brave-api-key-here"
  }
}
```

### 3. SQLite数据库服务器
提供数据库查询功能
```json
"sqlite": {
  "name": "sqlite",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./database.db"]
}
```

### 4. GitHub API服务器
提供GitHub仓库操作功能
```json
"github": {
  "name": "github", 
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token-here"
  }
}
```

### 5. Puppeteer浏览器自动化服务器
提供浏览器自动化功能
```json
"puppeteer": {
  "name": "puppeteer",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
}
```

## 🚀 完整配置示例

以下是一个包含多个MCP服务器的完整配置示例：

```json
{
  "model": "gpt-4o-mini",
  "temperature": 0.3,
  "maxTokens": 4096,
  "apiKey": "your-openai-api-key",
  "tavilyApiKey": "your-tavily-api-key", 
  "mcpServers": {
    "filesystem": {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname/workspace"],
      "env": {}
    },
    "brave-search": {
      "name": "brave-search",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "BSA_API_KEY_HERE"
      }
    },
    "sqlite": {
      "name": "sqlite", 
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./project.db"],
      "env": {}
    },
    "github": {
      "name": "github",
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
      }
    }
  },
  "tools": {
    "shellExecutor": {
      "defaultTimeout": 30000,
      "maxRetries": 3,
      "security": {
        "allowlist": ["git", "npm", "node", "pnpm", "yarn", "ls", "cat", "echo"],
        "blocklist": ["rm", "sudo", "chmod", "format"],
        "allowUnlistedCommands": false,
        "allowDangerousCommands": false
      }
    },
    "webTools": {
      "requestTimeout": 15000,
      "maxContentLength": 10000,
      "userAgent": "Tempurai-Bot/1.0 (Security-Enhanced)", 
      "enableCache": false
    }
  }
}
```

## 🔍 工具命名规则

当加载多个MCP服务器时，工具会自动按以下格式命名以避免冲突：
```
mcp_{服务器名}_{工具名}
```

例如：
- `mcp_filesystem_read_file`
- `mcp_brave-search_search`
- `mcp_sqlite_query`
- `mcp_github_create_issue`

## 🛠️ 技术实现

系统架构支持：
1. **并行连接**：同时连接到多个MCP服务器
2. **独立生命周期管理**：每个服务器独立管理连接和清理
3. **错误隔离**：单个服务器失败不影响其他服务器
4. **工具聚合**：将所有服务器的工具统一集成到AI助手中

## 🔧 故障排除

### 服务器连接失败
检查：
- 命令是否可执行
- 参数是否正确
- 环境变量是否设置
- 网络连接是否正常

### 工具冲突
- 系统会自动为工具添加服务器前缀，避免命名冲突
- 如果仍有问题，请使用不同的服务器名称

### 性能考虑
- 建议只配置需要的服务器
- 某些服务器可能需要API密钥或特殊权限
- 过多服务器可能影响启动时间

## 📊 查看状态

使用`tempurai config`命令可以查看当前MCP服务器状态：
```bash
tempurai config
```

输出将显示：
- 已连接的MCP服务器数量
- 加载的工具总数
- 各服务器的连接状态