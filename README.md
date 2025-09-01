# @tempurai/coder

<p align="center">
  <img src="https://img.shields.io/badge/AI--Powered-Code%20Assistant-blue?style=for-the-badge" alt="AI-Powered Code Assistant">
  <img src="https://img.shields.io/badge/Multi--Agent-Architecture-green?style=for-the-badge" alt="Multi-Agent Architecture">
  <img src="https://img.shields.io/badge/Terminal--Based-CLI-red?style=for-the-badge" alt="Terminal-Based CLI">
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a>
</p>

---

A next-generation intelligent code assistant that brings the power of multi-agent AI systems directly to your terminal. Built with TypeScript and powered by advanced reasoning capabilities, @tempurai/coder transforms how developers interact with their codebases.

## ✨ Key Highlights

- 🧠 **Multi-Agent Intelligence**: Smart reasoning + precise action execution
- 🛠️ **Rich Tool Ecosystem**: 15+ specialized tools for comprehensive code assistance
- 🎨 **Beautiful Terminal UI**: React-powered CLI with real-time updates
- 🔧 **Multi-Model Support**: Works with OpenAI, Anthropic, Google, and more
- 🔌 **Extensible Architecture**: MCP integration for custom tool development
- 📝 **Session Management**: Persistent conversations with snapshot capabilities

## 🚀 Installation

### Prerequisites

- Node.js 18+
- API key for supported AI models

### Global Installation

```bash
npm install -g @tempurai/coder
```

### Quick Setup

1. **Install the package**

   ```bash
   npm install -g @tempurai/coder
   ```

2. **Set your AI model API key**

   ```bash
   # For OpenAI (recommended)
   export OPENAI_API_KEY="your-key-here"

   # Or for Anthropic Claude
   export ANTHROPIC_API_KEY="your-key-here"
   ```

3. **Launch the application**
   ```bash
   coder
   ```

## 🌟 Features

### 🧠 Intelligent Multi-Agent System

**SmartAgent**: The core reasoning engine that breaks down complex tasks using advanced planning strategies

```
Planning Phase → Task Decomposition → Intelligent Execution → Result Synthesis
```

**ToolAgent**: Specialized tool executor managing 15+ built-in tools for comprehensive development assistance

**SubAgent**: Parallel task processor for handling complex, multi-step operations

**AgentOrchestrator**: Coordinates multiple agents to tackle sophisticated development workflows

### 🛠️ Comprehensive Tool Suite

| Category   | Tools                                                  | Description                                           |
| ---------- | ------------------------------------------------------ | ----------------------------------------------------- |
| **Shell**  | `shell_executor`, `multi_command`                      | Direct terminal command execution with error handling |
| **Files**  | `read_file`, `write_file`, `apply_patch`, `find_files` | Complete file management and intelligent patching     |
| **Web**    | `web_search`, `url_fetch`                              | Real-time web search and content retrieval            |
| **Git**    | `git_status`, `git_log`, `git_diff`                    | Comprehensive version control operations              |
| **Memory** | `save_memory`                                          | Persistent context across sessions                    |
| **MCP**    | Extensible via Model Context Protocol                  | Custom tool integration                               |

### 🎨 Modern Terminal Experience

Built with **React + Ink** for a native-like terminal interface featuring:

- **Real-time Streaming**: Live AI responses with thought processes
- **Interactive Components**: Progress bars, spinners, and dynamic updates
- **Code Syntax Highlighting**: Automatic language detection and formatting
- **Multi-Theme Support**: 6 beautiful themes (Dark, Light, Dracula, Solarized, etc.)
- **Responsive Design**: Adapts to any terminal size

### 🔧 Enterprise-Grade Architecture

- **Dependency Injection**: Clean, testable architecture with Inversify
- **Event-Driven**: Reactive system with comprehensive event handling
- **Security-First**: Configurable execution policies and path restrictions
- **Human-in-the-Loop**: Confirmation system for destructive operations
- **Graceful Interruption**: Ctrl+C handling with proper cleanup

## 📖 Quick Start

### Basic Usage

```bash
# Start the interactive CLI
coder

# Example conversation:
👤 Analyze the current project structure and suggest improvements

🤖 I'll analyze your project comprehensively...

💭 Planning: First I'll examine the project structure, then check dependencies,
   analyze code quality, and provide actionable recommendations.

🔧 Actions:
   ├── shell_executor: "find . -type f -name '*.json' | head -10"
   ├── read_file: "package.json"
   ├── shell_executor: "npm list --depth=0"
   └── find_files: "src/**/*.{ts,js,tsx,jsx}"

📊 Analysis Complete: Found TypeScript project with 23 components,
   React frontend, Express backend. Suggesting: dependency updates,
   test coverage improvement, and performance optimizations.
```

### Advanced Workflows

**Multi-Step Feature Implementation**

```bash
👤 Add user authentication with JWT tokens, including login/logout APIs and middleware

🤖 This is a complex task. Let me break it down systematically:

📋 TODO List:
   ☐ Analyze current project architecture
   ☐ Design authentication system architecture
   ☐ Implement JWT token utilities
   ☐ Create authentication middleware
   ☐ Build login/logout API endpoints
   ☐ Add route protection
   ☐ Write comprehensive tests
   ☐ Update documentation

🔧 Executing step 1/8: Analyzing current architecture...
```

**Intelligent Code Refactoring**

```bash
👤 Refactor the user service to use dependency injection

🤖 I'll refactor your user service to implement proper dependency injection:

💭 Analysis: Found UserService class with hard-coded dependencies.
   Will convert to constructor injection pattern with interfaces.

🔧 Actions:
   ├── read_file: "src/services/UserService.ts"
   ├── write_file: "src/interfaces/IUserRepository.ts"
   ├── apply_patch: Convert to dependency injection pattern
   ├── write_file: "src/services/UserService.ts" (refactored)
   └── shell_executor: "npm test -- UserService"

✅ Refactoring complete! UserService now uses dependency injection
   with proper interfaces and is fully testable.
```

### Technology Stack

| Layer              | Technology                      | Purpose                    |
| ------------------ | ------------------------------- | -------------------------- |
| **AI Integration** | AI SDK, Multi-provider support  | LLM orchestration          |
| **Agent System**   | Custom multi-agent architecture | Intelligent task execution |
| **Tool Ecosystem** | Modular tool system + MCP       | Extensible functionality   |
| **UI Framework**   | React + Ink                     | Modern terminal interface  |
| **Architecture**   | Inversify DI + TypeScript       | Clean, maintainable code   |
| **Testing**        | Jest + comprehensive test suite | Quality assurance          |

## ⚙️ Configuration

### Basic Configuration

The tool automatically creates a configuration directory at `~/.tempurai/`:

```
~/.tempurai/
├── config.json          # Main configuration
├── .tempurai.md         # Personal context & preferences
├── sessions/            # Conversation history
└── snapshots/           # Project state snapshots
```

## 🔒 Security

### Safe Execution Environment

- **Command Validation**: All shell commands validated before execution
- **Path Restrictions**: Configurable file system access controls
- **Permission System**: Human confirmation for destructive operations
- **API Key Protection**: Secure credential management
- **Audit Logging**: Comprehensive operation tracking

### Security Configuration

```json
{
  "security": {
    "allowShellExecution": true,
    "allowFileWrite": true,
    "restrictedPaths": ["/etc", "/sys", "/proc"],
    "requireConfirmation": ["rm", "del", "format"],
    "maxFileSize": "10MB",
    "sessionTimeout": 3600
  }
}
```

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Workflow

1. **Fork & Clone**

   ```bash
   git clone https://github.com/your-username/coder.git
   cd coder
   ```

2. **Setup Development Environment**

   ```bash
   npm install
   npm run dev
   ```

3. **Create Feature Branch**

   ```bash
   git checkout -b feature/amazing-feature
   ```

4. **Make Changes & Test**

   ```bash
   npm test
   npm run build
   ```

5. **Submit Pull Request**

### Bug Reports

Please use GitHub Issues with:

- OS and Node.js version
- Steps to reproduce
- Expected vs actual behavior
- Error logs/screenshots

## 📄 License

Apache-2.0 License with amendments - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with exceptional open-source tools:

- [**AI SDK**](https://sdk.vercel.ai/) - Multi-model AI integration
- [**Ink**](https://github.com/vadimdemedes/ink) - React for CLI
- [**Inversify**](https://inversify.io/) - Dependency injection
- [**Zod**](https://zod.dev/) - Type-safe validation
- [**Jest**](https://jestjs.io/) - Testing framework

---

<p align="center">
  <strong>Made with ❤️ by the Tempurai team</strong><br>
  <a href="https://tempurai.dev">Website</a> • 
  <a href="https://discord.gg/tempurai">Discord</a> • 
  <a href="https://github.com/tempurai/coder/issues">Issues</a>
</p>
