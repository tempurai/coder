# MCP 集成指南

Tempurai Coder 现在支持模型上下文协议 (MCP)，允许动态加载外部工具来扩展 AI 助手的能力。

## 什么是 MCP？

模型上下文协议 (Model Context Protocol) 是一个开放的标准，允许 AI 应用与外部工具服务器通信。这意味着您可以：

- 🔌 动态添加新工具，无需修改核心代码
- 🌍 使用任何语言编写的 MCP 服务器
- 📈 无限扩展 AI 助手的能力
- 🔧 复用社区开发的工具

## 配置 MCP 服务器

在您的配置文件 (`~/.tempurai/config.json`) 中添加 `mcpServers` 字段：

```json
{
  "model": "gpt-4o-mini",
  "apiKey": "your-openai-api-key",
  "mcpServers": {
    "filesystem": {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/safe/directory"],
      "env": {
        "NODE_ENV": "production"
      }
    },
    "brave-search": {
      "name": "brave-search",
      "command": "uvx",
      "args": ["mcp-server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-brave-api-key"
      }
    }
  }
}
```

## 服务器配置参数

每个 MCP 服务器配置支持以下参数：

- `name`: 服务器的显示名称
- `command`: 启动服务器的命令
- `args`: 命令行参数数组
- `env`: 环境变量对象

## 热门 MCP 服务器

### 1. 文件系统服务器

```json
{
  "filesystem": {
    "name": "filesystem",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/safe/path"],
    "env": {}
  }
}
```

提供安全的文件系统访问能力。

### 2. GitHub 服务器

```json
{
  "github": {
    "name": "github",
    "command": "uvx",
    "args": ["mcp-server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
    }
  }
}
```

与 GitHub API 交互，管理仓库和问题。

### 3. 数据库服务器

```json
{
  "sqlite": {
    "name": "sqlite",
    "command": "uvx",
    "args": ["mcp-server-sqlite", "--db-path", "/path/to/database.db"],
    "env": {}
  }
}
```

查询和操作 SQLite 数据库。

## 查看已加载的 MCP 工具

启动 Tempurai 后，使用 `/config` 命令查看已加载的 MCP 工具：

```
> /config
┌────────────────────────────────────────────────────────────┐
│ 🔧 Configuration:                                         │
│                                                            │
│   Model: gpt-4o-mini                                       │
│   MCP Tools: 3 loaded (2 connections)                     │
│     - read_file, write_file, search_github                │
└────────────────────────────────────────────────────────────┘
```

## 故障排除

### 1. 工具未加载

- 检查 MCP 服务器的命令和参数是否正确
- 确认所需的依赖已安装 (如 `npx`, `uvx`)
- 查看启动日志中的错误信息

### 2. 连接失败

- 验证环境变量是否正确设置
- 检查文件路径权限
- 确认 MCP 服务器版本兼容性

### 3. 性能问题

- MCP 工具调用可能比本地工具慢
- 考虑为频繁使用的功能使用内置工具
- 监控连接数量，避免过多服务器

## 开发自定义 MCP 服务器

您可以使用任何语言开发自己的 MCP 服务器。参考官方文档：

- [MCP 规范](https://modelcontextprotocol.io/docs)
- [Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## 安全注意事项

- 🚨 只运行可信的 MCP 服务器
- 🔒 对文件系统访问使用受限路径
- 🔐 妥善管理 API 密钥和环境变量
- 👀 定期审查配置的服务器
