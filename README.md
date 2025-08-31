# @tempurai/coder

A next-generation intelligent code assistant built with TypeScript, featuring **ReAct (Reason + Act)** methodology, shell-first approach, and an advanced CLI interface for AI-powered coding assistance.

## 📦 Installation

Install globally via npm:

```bash
npm install -g @tempurai/coder
```

After installation, you can start the tool anywhere using:

```bash
coder
```

## 🚀 Revolutionary Features

- **🧠 ReAct Agent Architecture**: Intelligent reasoning followed by precise actions using state-of-the-art AI models
- **🖥️ Interactive CLI Interface**: Beautiful terminal-based interface with real-time updates and progress indicators
- **⚡ Shell-First Philosophy**: Direct command execution instead of over-engineered abstractions
- **🎯 Smart Tool Ecosystem**: Comprehensive set of tools for file operations, git management, web search, and more
- **🔄 Intelligent Error Recovery**: Failed operations trigger automatic alternative strategies
- **💻 Multi-Model Support**: Works with OpenAI, Anthropic, Google, Cohere, and Mistral models
- **🛠️ MCP Integration**: Model Context Protocol support for extending tool capabilities
- **📝 Session Management**: Persistent conversations with snapshot capabilities
- **🎨 Beautiful Terminal UI**: Modern interface with themes, spinners, and rich text formatting

## 🎯 Architecture Overview

### **Core Agents**

- **SmartAgent**: Main reasoning agent that orchestrates complex tasks using ReAct methodology
- **ToolAgent**: Manages and executes all available tools (file operations, shell commands, web search, etc.)
- **SubAgent**: Handles specialized subtasks and parallel processing
- **AgentOrchestrator**: Coordinates multiple agents for complex workflows

### **Primary Tools** (Most Common Usage)

- **🔧 shell_executor**: Direct shell command execution - git, find, grep, npm, build tools, etc.
- **📝 multi_command**: Execute multiple shell commands in sequence with error handling
- **📖 read_file**: Read and analyze file contents with smart chunking
- **✏️ write_file**: Create or update files with automatic backup
- **🎨 apply_patch**: Intelligent diff/patch application with validation

### **Advanced Tools**

- **🔍 find_files**: Pattern-based file search across project directories
- **🌐 web_search**: Real-time web search using Tavily API
- **� url_fetch**: Fetch and process web page content
- **�️ git_status/git_log/git_diff**: Comprehensive git operations
- **💾 save_memory**: Persistent memory for cross-session context
- **🔧 MCP Tools**: Extensible tools via Model Context Protocol

### **Supporting Services**

- **SessionService**: Manages conversation sessions and state
- **HITLManager**: Human-in-the-loop interactions for confirmations
- **FileWatcherService**: Real-time file system monitoring
- **InterruptService**: Graceful task interruption and cancellation

## ⚡ Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- API key for supported AI models (OpenAI, Anthropic, Google, etc.)

### Global Installation

```bash
npm install -g @tempurai/coder
```

### Configuration

Set up your AI model API key using environment variables:

```bash
# For OpenAI (recommended)
export OPENAI_API_KEY="your-openai-api-key"

# For Anthropic Claude
export ANTHROPIC_API_KEY="your-anthropic-api-key"

# For Google Gemini
export GOOGLE_GENERATIVE_AI_API_KEY="your-google-api-key"

# For Cohere
export COHERE_API_KEY="your-cohere-api-key"

# For Mistral
export MISTRAL_API_KEY="your-mistral-api-key"

# Optional: Web search capability
export TAVILY_API_KEY="your-tavily-api-key"
```

### Launch the Application

```bash
coder
```

This opens an interactive terminal interface where you can:

- Ask questions about your codebase
- Request code changes and implementations
- Get help with debugging and optimization
- Analyze project structure and dependencies
- Perform automated refactoring tasks

### Advanced Configuration

Create a configuration file `~/.tempurai/config.json`:

```json
{
  "provider": "openai",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 4000,
  "tools": {
    "tavilyApiKey": "your-tavily-key-for-web-search"
  },
  "security": {
    "allowShellExecution": true,
    "allowFileWrite": true,
    "restrictedPaths": ["/etc", "/sys", "/proc"]
  }
}
```

## 💡 Usage Examples

### 🔍 **Project Analysis**

```
👤 User: "What's the current state of this project?"

🤖 Tempurai: I'll analyze your project structure and current status.

Actions taken:
- shell_executor: "find . -type f -name '*.ts' -o -name '*.js' | head -20"
- shell_executor: "git status --short"
- read_file: "package.json"
- shell_executor: "npm list --depth=0"

Result: This is a TypeScript project with 15 source files, 3 uncommitted changes,
using React and Express. The project appears to be a web application with both
frontend and backend components.
```

### ⚡ **Smart Code Refactoring**

```
👤 User: "Add error handling to the authentication function"

🤖 Tempurai: I'll locate the authentication function and add comprehensive error handling.

Actions taken:
- shell_executor: "grep -r 'function.*auth\\|authenticate' src/"
- read_file: "src/auth/authentication.ts"
- apply_patch: Add try-catch blocks and error logging
- shell_executor: "npm run test -- auth" (validate changes)

Result: Added error handling with proper logging and user-friendly error messages.
The authentication function now handles network errors, invalid credentials,
and timeout scenarios gracefully.
```

### 🔄 **Complex Feature Implementation**

```
👤 User: "Add rate limiting to all API endpoints"

🤖 Tempurai: This is a complex task. Let me break it down into manageable steps.

Planning phase:
1. Analyze current API structure and middleware setup
2. Choose appropriate rate limiting strategy
3. Implement rate limiting middleware
4. Apply middleware to all routes
5. Add configuration options
6. Test the implementation

Execution:
- multi_command: Analyze routes and middleware
- write_file: Create rate limiting middleware
- apply_patch: Integrate with existing routes
- shell_executor: Run tests to validate implementation

Result: Successfully implemented Redis-based rate limiting across all API endpoints
with configurable limits per route and user role.
```

### 🚀 **End-to-End Development Workflow**

```
👤 User: "Create a new user profile page with form validation"

🤖 Tempurai: I'll create a complete user profile feature with modern best practices.

Workflow:
1. Project structure analysis
2. Component architecture planning
3. Frontend component creation (React + TypeScript)
4. Form validation setup (Zod schemas)
5. Backend API endpoints
6. Database integration
7. Comprehensive testing
8. Documentation updates

Result: Created a full-featured user profile system with client-side validation,
secure API endpoints, database persistence, and full test coverage.
```

## 🏗️ Technical Architecture

### **ReAct Agent System**

```
🧠 SmartAgent (ReAct Core)
├── 🤔 Reasoning Engine: Analyzes tasks and plans approach
├── 🎯 Action Executor: Executes planned actions via tools
├── 📋 Todo Manager: Breaks complex tasks into manageable steps
└── 🔄 Orchestrator: Coordinates multiple agents and workflows

�️ Tool Agent (Tool Management)
├── 🔧 Shell Executor: Direct command line integration
├── 📝 File Operations: Read, write, and patch files
├── 🌐 Web Tools: Search and fetch web content
├── 📊 Git Integration: Status, log, diff operations
└── 🔌 MCP Tools: Extensible tool protocol support

🎨 Terminal Interface (User Experience)
├── 📟 Interactive CLI: Beautiful terminal-based interface
├── 🎯 Progress Indicators: Real-time operation feedback
├── 🎨 Theming System: Multiple color schemes
├── 💬 Event Streaming: Live updates and responses
└── 📱 Responsive Design: Works in any terminal size
```

### **Dependency Injection Architecture**

Built with Inversify.js for clean, testable, and maintainable code:

```typescript
// Core services are automatically injected
@injectable()
class SmartAgent {
  constructor(
    @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    @inject(TYPES.InterruptService) private interruptService: InterruptService,
  ) {}
}
```

### **Session Management**

- **Persistent Sessions**: Conversations saved across restarts
- **Snapshot System**: Capture and restore project states
- **Memory Tools**: Cross-session context preservation
- **Interrupt Handling**: Graceful cancellation of long-running tasks

## 🔧 Development

### **Building from Source**

```bash
# Clone the repository
git clone https://github.com/tempurai/coder.git
cd coder

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

### **Project Structure**

```
src/
├── agents/           # AI agent implementations
│   ├── smart_agent/  # Main ReAct agent
│   ├── tool_agent/   # Tool management
│   └── compressed_agent/ # Lightweight agent
├── cli/              # Terminal interface
│   ├── components/   # UI components
│   ├── themes/       # Color themes
│   └── hooks/        # React hooks for terminal
├── tools/            # Tool implementations
│   ├── ShellExecutor.ts    # Shell command execution
│   ├── SimpleFileTools.ts # File operations
│   ├── WebTools.ts        # Web search/fetch
│   ├── GitTools.ts        # Git integration
│   └── McpToolLoader.ts   # MCP protocol support
├── services/         # Core services
│   ├── SessionService.ts  # Session management
│   ├── HITLManager.ts     # Human interaction
│   └── InterruptService.ts # Task cancellation
├── config/           # Configuration system
├── events/           # Event handling
└── di/               # Dependency injection
```

### **Configuration**

The tool automatically creates configuration files in `~/.tempurai/`:

```bash
~/.tempurai/
├── config.json      # Main configuration
├── sessions/        # Saved conversation sessions
├── snapshots/       # Project state snapshots
└── memory/          # Persistent memory storage
```

## 🎨 Terminal Interface Features

### **Interactive Components**

- **Thought Bubbles**: Show AI reasoning process in real-time
- **Action Indicators**: Visual feedback for tool execution
- **Progress Bars**: Long-running operation status
- **Code Syntax Highlighting**: Automatic language detection
- **Error Visualization**: Clear error messages with suggestions

### **Theme System**

Built-in themes for different preferences:

- **Light**: Clean, minimal design for bright environments
- **Dark**: Easy on the eyes for extended coding sessions
- **Dracula**: Popular dark theme with purple accents
- **Solarized**: Low-contrast theme reducing eye strain
- **Monokai**: Classic dark theme with vibrant colors
- **High Contrast**: Accessibility-focused high contrast theme

### **Keyboard Shortcuts**

- `Ctrl+C`: Interrupt current operation
- `Ctrl+D`: Exit the application
- `↑/↓`: Navigate conversation history
- `Tab`: Auto-complete commands and file paths
- `Ctrl+L`: Clear screen while preserving session

## 🤖 Supported AI Models

### **OpenAI (Recommended)**

- **GPT-4**: Best reasoning and coding capabilities
- **GPT-4 Turbo**: Faster responses with good quality
- **GPT-3.5 Turbo**: Cost-effective option for simple tasks

### **Anthropic**

- **Claude 3.5 Sonnet**: Excellent for code analysis and refactoring
- **Claude 3 Haiku**: Fast responses for quick questions
- **Claude 3 Opus**: Most capable model for complex tasks

### **Google**

- **Gemini Pro**: Strong coding capabilities with multimodal support
- **Gemini Flash**: Fast and cost-effective option

### **Others**

- **Cohere Command**: Good for text processing tasks
- **Mistral Large**: Open-source alternative with good performance

## � Extensibility

### **Model Context Protocol (MCP)**

Extend capabilities by connecting to MCP servers:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": ["@modelcontextprotocol/server-filesystem", "/path/to/project"]
      },
      "github": {
        "command": "npx",
        "args": ["@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token"
        }
      }
    }
  }
}
```

### **Custom Tools**

Add custom tools by implementing the Tool interface:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const customTool = tool({
  description: 'My custom tool for specific operations',
  parameters: z.object({
    input: z.string().describe('Input parameter'),
  }),
  execute: async ({ input }) => {
    // Your custom implementation
    return { result: 'Success' };
  },
});
```

## 🔒 Security

### **Safe Execution**

- **Command Validation**: All shell commands are validated before execution
- **Path Restrictions**: Configurable restrictions on file system access
- **Permission Checks**: Requires explicit permission for destructive operations
- **Sandboxing**: Optional containerized execution environment

### **API Key Security**

- **Environment Variables**: Secure API key storage
- **No Logging**: API keys never logged or stored in plaintext
- **Rotation Support**: Easy API key rotation without reconfiguration

## 📊 Performance

### **Optimizations**

- **Streaming Responses**: Real-time AI response streaming
- **Tool Caching**: Frequently used tool results cached
- **Lazy Loading**: Components loaded on demand
- **Memory Management**: Automatic cleanup of old sessions

### **Benchmarks**

- **Startup Time**: < 2 seconds cold start
- **Response Time**: < 1 second for simple queries
- **Memory Usage**: ~50MB base, scales with conversation length
- **Token Efficiency**: Optimized prompts reduce API costs by ~30%

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### **Development Setup**

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Submit a pull request

### **Bug Reports**

Please use GitHub Issues to report bugs. Include:

- Your operating system and Node.js version
- Steps to reproduce the issue
- Expected vs actual behavior
- Any error messages or logs

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [AI SDK](https://sdk.vercel.ai/) for multi-model support
- Terminal interface powered by [Ink](https://github.com/vadimdemedes/ink)
- Dependency injection via [Inversify](https://inversify.io/)
- Configuration validation with [Zod](https://zod.dev/)
- Inspired by Claude Code, Cursor, and other innovative coding assistants

---

**Made with ❤️ by the Tempurai team**

For more information, visit our [website](https://tempurai.dev) or join our [Discord community](https://discord.gg/tempurai).
