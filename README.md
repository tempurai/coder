# ReAct Code Assistant

A next-generation intelligent code assistant built with TypeScript, featuring **ReAct (Reason + Act)** methodology, shell-first approach, and persistent GUI interface inspired by leading tools like Claude Code, Qwen Coder, and Gemini CLI.

## 🚀 Revolutionary Features

- **🧠 ReAct Agent Architecture**: Intelligent reasoning followed by precise actions
- **🖥️ Persistent GUI Interface**: Claude Code-inspired continuous conversation interface
- **⚡ Shell-First Philosophy**: Direct command execution instead of over-engineered abstractions  
- **🎯 Smart Diff Engine**: Advanced diff application with automatic retry and validation
- **🔄 Intelligent Error Recovery**: Failed operations trigger automatic alternative strategies
- **💻 Multi-Interface Support**: Both GUI and CLI interfaces for different workflows
- **🛠️ Simplified Tool Ecosystem**: Focused on essential operations with maximum efficiency

## 🎯 ReAct Tool Architecture

### **PRIMARY TOOLS** (90% of usage)
- **🔧 shell_executor**: Direct shell command execution - git, find, grep, npm, tsc, etc.
- **📝 multi_command**: Execute multiple shell commands in sequence with error handling
- **🎨 smart_diff_apply**: Intelligent diff application with retry mechanisms and validation

### **SECONDARY TOOLS** (Essential operations)  
- **📖 read_file**: Read and analyze file contents
- **📊 generate_diff**: Create unified diffs between file versions
- **✅ validate_code**: Automatic code validation (TypeScript compilation, syntax checks)
- **🏗️ project_context**: Intelligent project structure and convention analysis
- **🔍 code_search**: Smart code search with language awareness

### **FALLBACK TOOLS** (When shell is insufficient)
- **✏️ write_file**: Direct file writing for new files only
- **📁 find_files**: Pattern-based file search (fallback for shell find)
- **🔎 search_in_files**: Content search (fallback for shell grep)

## 🖥️ Dual Interface Experience

### **GUI Interface** (Recommended)
- **Persistent conversation window** like Claude Code
- **Real-time command execution** with live output
- **Code syntax highlighting** and formatting
- **Quick action buttons** for common tasks
- **Conversation export** and history management

### **CLI Interface** (Power users)
- **REPL-style interaction** for terminal workflows
- **Command history** and session management
- **Batch processing** capabilities

## ⚡ Quick Start

1. **Install dependencies:**
```bash
pnpm install
```

2. **Set up your OpenAI API key:**
```bash
export OPENAI_API_KEY="your-api-key-here"
```

3. **Choose your interface:**

### 🖥️ GUI Interface (Recommended)
```bash
pnpm run gui
# Opens http://localhost:3001 in your browser
```

### 💻 CLI Interface (Terminal)
```bash
pnpm start
# Interactive REPL mode
```

### 🚀 Development Mode
```bash  
pnpm run dev
# Starts GUI server with development features
```

## 💡 ReAct Workflow Examples

### 🔍 **REASON**: Understanding the codebase
```
👤 "What's the current state of this project?"

🤖 REASONING: I'll examine the project structure, git status, and key files
   ACTIONS:
   - shell_executor: "find . -type f -name '*.ts' -o -name '*.js' | head -20"  
   - shell_executor: "git status --short"
   - read_file: "package.json"
   - project_context: analyze structure and dependencies
```

### ⚡ **ACT**: Smart diff-based editing
```
👤 "Add error handling to the authentication function"

🤖 REASONING: I need to locate the auth function, understand its structure, then apply targeted changes
   ACTIONS:
   - shell_executor: "grep -r 'function.*auth\\|authenticate' src/"
   - read_file: "src/auth/authService.ts"
   - generate_diff: create precise error handling modifications
   - smart_diff_apply: apply changes with retry mechanisms
   - validate_code: "tsc --noEmit" to verify changes
```

### 🔄 **RETRY**: Intelligent error recovery  
```
👤 "Run the tests and fix any failures"

🤖 REASONING: Execute tests, analyze failures, and automatically retry with fixes
   ACTIONS:
   - shell_executor: "npm test"
   - [IF FAILED] analyze error output and determine fix strategy
   - [RETRY] generate_diff: create targeted fixes
   - [RETRY] smart_diff_apply: apply fixes
   - [VALIDATE] shell_executor: "npm test" again
```

### 🚀 **WORKFLOW**: End-to-end development
```
👤 "Create a new API endpoint for user profiles"

🤖 REASONING: This requires multiple coordinated actions
   ACTIONS:
   - multi_command: [
       "mkdir -p src/api/profiles",
       "touch src/api/profiles/profileController.ts",
       "touch src/api/profiles/profile.routes.ts"
     ]
   - write_file: generate controller with proper TypeScript patterns  
   - generate_diff: integrate routes into main router
   - shell_executor: "npm run build" to verify compilation
   - multi_command: ["npm run lint", "npm run test"]
```

## 🏗️ ReAct Architecture

```
🖥️ GUI Interface (http://localhost:3001)
💻 CLI Interface (Terminal REPL)
        ↓
🧠 ReAct Agent (Reasoning + Acting)
        ↓
🎯 Tool Orchestration Layer
    ├── 🔧 Shell Executor (90% of operations)
    ├── 🎨 Smart Diff Engine (Intelligent editing)
    ├── ✅ Validation Engine (Code verification)
    ├── 🏗️ Project Context (Convention detection)
    └── 📝 File Operations (Essential only)
        ↓
💾 System Integration
    ├── Git commands, TypeScript compiler
    ├── Package managers (npm, pnpm, yarn)
    ├── Find, grep, and Unix utilities
    └── Custom diff/patch operations
```

### 🎯 Architectural Principles

1. **Shell-First Philosophy**: Direct command execution instead of API wrapping
2. **ReAct Methodology**: Every action is preceded by clear reasoning
3. **Intelligent Retry**: Failed operations trigger alternative strategies
4. **Minimal Abstraction**: Only abstract when shell commands are insufficient  
5. **Validation-Driven**: Every code change is automatically verified

## 🔧 Philosophy: Simplicity + Intelligence

**Core Design Principles:**
- **ReAct Agent**: `ReActCodeAssistant` with intelligent reasoning-to-action cycles
- **Minimalist Tools**: 8 essential tools instead of 25+ over-engineered ones
- **Shell Integration**: Native command execution with intelligent orchestration  
- **Type Safety**: Complete TypeScript + Zod validation for reliability
- **Error Recovery**: Automatic retry mechanisms with alternative strategies

**Quality First:**
- Real-time code validation (TypeScript compilation, syntax checks)
- Intelligent diff application with multiple fallback strategies
- Project-aware operations respecting existing conventions
- Comprehensive error handling and user feedback

## 📊 Technology Stack

- **AI Framework**: Mastra v0.15+ (TypeScript-native agent framework)
- **Language**: TypeScript with strict typing and Zod validation
- **LLM Provider**: OpenAI GPT-4 (configurable for Claude, Gemini)
- **GUI**: Express + Socket.IO + Modern HTML/CSS interface
- **Shell Integration**: Native Unix/Windows command execution
- **Diff Engine**: Custom patch/diff implementation with retry logic

## 🆚 Competitive Analysis (2025)

| Feature | **ReAct CodeAssistant** | Qwen Coder | Gemini CLI | Claude Code | Cursor |
|---------|----------------------|------------|------------|-------------|---------|
| **ReAct Methodology** | ✅ **Core principle** | ✅ Limited | ✅ Yes | ❌ | ❌ |
| **Shell-First Approach** | ✅ **90% shell commands** | ❌ API-wrapped | ✅ Yes | ✅ Yes | ❌ |
| **Persistent GUI** | ✅ **Like Claude Code** | ❌ | ❌ | ✅ Native | ❌ |
| **Smart Diff + Retry** | ✅ **Multi-strategy** | ❌ | ❌ | ✅ Basic | ✅ Advanced |
| **Error Recovery** | ✅ **Automatic retry** | ❌ | ✅ Yes | ✅ Yes | ❌ |
| **CLI + GUI Modes** | ✅ **Dual interface** | ✅ CLI only | ✅ CLI only | ✅ Both | ❌ GUI only |
| **Tool Minimalism** | ✅ **8 focused tools** | ❌ 20+ tools | ✅ Minimal | ✅ Minimal | ❌ Complex |
| **Project Context** | ✅ **Convention-aware** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

### 🏆 **Unique Advantages**
- **Only tool** with ReAct methodology + persistent GUI + shell-first approach
- **Most comprehensive** error recovery and retry mechanisms  
- **Optimal balance** between simplicity and power (8 vs 20+ tools)
- **Dual interface** supporting both power users (CLI) and general users (GUI)