# @tempurai/coder

<p align="center">
  <img src="https://img.shields.io/badge/AI--Powered-Code%20Assistant-blue?style=for-the-badge" alt="AI-Powered Code Assistant">
  <img src="https://img.shields.io/badge/Multi--Agent-Architecture-green?style=for-the-badge" alt="Multi-Agent Architecture">
  <img src="https://img.shields.io/badge/Terminal--Based-CLI-red?style=for-the-badge" alt="Terminal-Based CLI">
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a> •
  <a href="#key-features">Key Features</a> •
  <a href="#usage-guide">Usage Guide</a> •
  <a href="#core-philosophy">Core Philosophy</a>
</p>

---

**An AI-Powered Command-Line Assistant for Complex Software Engineering**

Tempurai Coder is a sophisticated, terminal-based AI assistant built for developers who need a powerful partner for complex coding tasks. It moves beyond simple code completion, employing an intelligent, multi-agent architecture to understand high-level goals, formulate detailed execution plans, and safely interact with your development environment.

It's a tool designed to augment your workflow, handling the heavy lifting of multi-step refactoring, codebase analysis, and feature implementation, all without leaving the comfort of your terminal.

---

### Core Philosophy

Tempurai Coder is built on two fundamental principles that guide its behavior:

1.  **Plan-then-Execute**: For any non-trivial task, the agent's first step is to stop and think. It uses a `TodoManager` to create a structured, transparent plan that breaks the problem down into logical steps. This avoids reactive, error-prone behavior and ensures a methodical approach to complex problems. You always know what the agent is planning to do and why.

2.  **Shell First, Safety Always**: The agent's primary tool for interacting with your project is the shell. This gives it the same power and flexibility as a human developer, allowing it to use `git`, `grep`, `ls`, and run project-specific scripts. This power is balanced by a robust safety layer, including a `SecurityPolicyEngine` to block dangerous commands and a `Human-in-the-Loop` confirmation system for all file modifications.

### Getting Started

#### Prerequisites

- Node.js (v18.0 or higher recommended)
- A supported LLM API key (e.g., OpenAI, Google, Anthropic)

#### 1. Installation

```bash
# Assuming the package is published to npm under this name
npm install -g tempurai-coder
```

#### 2. Configuration

On the first run, the application will create a global configuration directory and files at `~/.tempurai/`.

1.  Open `~/.tempurai/config.json` in your editor.
2.  In the `models` array, specify your provider, model name, and add your API key.
3.  (Optional) To enable web search, add your Tavily API key under `tools.tavilyApiKey`.

```json
{
  "models": [
    {
      "provider": "openai",
      "name": "gpt-4o",
      "apiKey": "sk-..."
    }
  ],
  "tools": {
    "tavilyApiKey": "tvly-..."
  }
}
```

### Usage Guide

#### Launching the Application

Navigate to your project's root directory and run the command:

```bash
tempurai
```

#### Core Actions

- **Submit a Task**: Type your request (e.g., `Add a new endpoint '/status' to the main server that returns { status: 'ok' }`) and press `Enter`.
- **Open Execution Mode Selector**: Type `:` to choose between `Plan Mode` and `Code Mode`.
- **Open Command Palette**: Type `/` to access internal commands like `/help` or `/theme`.

#### Key Hotkeys

| Hotkey            | Action           | Description                                                                                            |
| :---------------- | :--------------- | :----------------------------------------------------------------------------------------------------- |
| `Shift` + `Tab`   | Cycle Edit Mode  | Toggle between `Normal` (confirm every edit) and `Always Accept` (auto-approve edits for the session). |
| `Ctrl` + `T`      | Cycle Theme      | Quickly switch between available UI themes.                                                            |
| `Esc`             | Interrupt Agent  | Stop the agent's current operation.                                                                    |
| `Ctrl` + `C` (x2) | Exit Application | Forcefully exit the application.                                                                       |

### Key Features

#### Intelligent Agentic Core

- **Hierarchical Agent System**: Employs a `SmartAgent` for high-level strategy, which delegates tasks to a tactical `ToolAgent`. For highly complex sub-problems, it can even spawn a specialized `SubAgent` to work autonomously.
- **Structured Task Planning**: Automatically generates a step-by-step `Todo` list for complex requests, providing a clear and predictable execution path.
- **Contextual Compression**: Features a `CompressedAgent` that intelligently summarizes long conversations, ensuring the agent maintains critical context over extended tasks without hitting token limits.

#### Robust Safety Features

- **Automatic Snapshots**: Before executing any task, the system automatically creates a git-based snapshot of your project's current state. This acts as a safety net, allowing you to instantly revert any changes if needed.
- **Human-in-the-Loop (HITL) Confirmation**: You are always in control. The agent will pause and ask for explicit permission before creating, modifying, or deleting any files.
- **Configurable Security Engine**: A `SecurityPolicyEngine` validates all shell commands against allow/block lists and internal heuristics to prevent the execution of dangerous or unintended operations.

#### Developer-Centric Experience

- **Interactive Terminal UI**: A rich, responsive interface built with React (Ink) that feels like a native part of the modern terminal workflow.
- **Dual Execution Modes**:
  - **`Code Mode`**: Full development capabilities, enabling the agent to write and modify files.
  - **`Plan Mode`**: A read-only sandbox for research, analysis, and strategy formulation without any risk of side effects.
- **Customizable Themes**: Choose from multiple built-in color schemes to match your terminal setup.

### How It Works (High-Level)

Tempurai Coder operates on a decoupled, event-driven architecture. The terminal UI is a pure rendering layer that subscribes to a stream of events from the backend. The backend is coordinated by a `SessionService` which manages state and invokes the **Agentic Core**.

The Agentic Core is where the real intelligence lies. A `SmartAgent` analyzes the user's request, creates a plan using the `TodoManager`, and then executes the plan step-by-step by instructing a `ToolAgent` to use tools like the `ShellExecutor` or `FilePatcher`.

> For a detailed breakdown of the components and their interactions, see our **[ARCHITECTURE.md](ARCHITECTURE.md)**.

### Comparison with Other Tools

Tempurai Coder finds its niche by combining the power of an agentic framework with a terminal-native workflow:

- **vs. Gemini CLI / Cline**: These are excellent general-purpose AI CLIs. Tempurai is hyper-focused on the **in-project software development lifecycle**, integrating deeply with the file system, version control, and safety mechanisms like snapshots.
- **vs. Continue / iFlow**: These tools excel as IDE extensions. Tempurai is designed for developers who prefer a **terminal-native, keyboard-driven workflow**, offering a powerful, self-contained environment without leaving the command line.
- **vs. Qwen-Code / Raw LLM CLIs**: Tempurai provides a robust **agentic framework** around the LLM. Instead of simple prompt-in/code-out, it performs multi-step reasoning, planning, and safe tool execution, enabling it to handle much more complex, long-running tasks.

---

## 📄 License

Apache-2.0 License with amendments - see [LICENSE](LICENSE) for details.
