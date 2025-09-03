# Architecture Overview

Tempurai Coder is architected as a layered, event-driven system. The core design principle is the separation of concerns, where the user interface, application state, agentic reasoning, and environment interactions are all decoupled.

The system's intelligence is centered around a **multi-component reasoning engine**, designed to handle complex, multi-step software engineering tasks in a structured and transparent manner.

### High-Level Flow

The system's operation follows a clear, unidirectional flow. The UI captures user intent, which is passed to the service layer for management. The service layer then invokes the agentic core, which performs its reasoning and uses tools to interact with the environment. All feedback to the UI is sent via an asynchronous event bus.

**Simple ASCII Flow:**

`CLI (Ink UI) <--> Session & Service Layer <--> Agentic Core -> Tooling System`

### Core Modules

#### 1. The Agentic Core (The "Brain")

This is the heart of the application, responsible for all reasoning, planning, and decision-making. It operates through a distinct, two-phase lifecycle for any non-trivial task: Planning and Execution.

##### **Phase 1: The Planning Phase**

Before taking any action, the `SmartAgent` first enters a dedicated planning phase. It analyzes the user's request to understand its complexity and requirements. For any task that requires more than a single step, it formulates a comprehensive strategy. This initial plan is not just an internal thought; it is made concrete and transparent through a key component:

- **`TodoManager` (The Planner)**: This is the backbone of the agent's strategic capability. The `SmartAgent` uses it to create a structured, step-by-step plan, breaking the main goal into a checklist of smaller, manageable tasks.
  - **Why is this important?** This design choice provides immense value:
    1.  **Transparency**: The user can see the agent's exact plan of action.
    2.  **Structured Execution**: The agent follows the plan systematically, preventing it from getting lost or stuck in loops.
    3.  **Resilience**: If a step fails, the plan makes it easier to adapt and continue.

##### **Phase 2: The Execution Loop & Component Roles**

Once a plan is in place, the `SmartAgent` begins the execution loop, orchestrating a set of specialized components to carry out the plan.

- **`SmartAgent` (Strategic Layer)**: The high-level orchestrator that directs the entire process. It queries the `TodoManager` for the next step, decides which tools are needed, and processes the results to inform its next move.

- **`ToolAgent` (Execution Layer)**: The tactical agent that serves as the **common execution layer** for the entire agentic core. It receives concrete instructions from either the `SmartAgent` or a `SubAgent` (e.g., "run this shell command") and is solely responsible for interfacing with the Tooling System.

- **`SubAgent` (The Specialist)**: For highly complex, self-contained tasks, the `SmartAgent` can delegate the work to an autonomous `SubAgent`. This is a powerful delegation pattern.
  - **When is it used?** For tasks like "Perform a deep analysis of the entire codebase to find all usages of this deprecated library."
  - **Benefit**: The `SubAgent` works in an isolated context. It follows the same architectural pattern as the main agent—performing its own reasoning and then **directing the `ToolAgent`** to execute its commands. It returns only the final, comprehensive result.

- **`CompressedAgent` (The Memory Manager)**: To handle long conversations without losing context, this agent is responsible for the system's "long-term memory." It periodically compresses older parts of the conversation history into a concise summary that is fed back into the `SmartAgent`'s context.

- **`AgentOrchestrator` (The Governor)**: This is a meta-level component that monitors the `SmartAgent`'s execution loop. Its key feature is the **`LoopDetector`**, which analyzes the agent's recent actions to identify repetitive, non-productive behavior and prevent the agent from getting stuck.

- **Agentic Interaction Model (ASCII)**:

  ```
  +-----------------+      +--------------------+      +--------------------+
  |  User's Goal    |----->|   Session Service  |----->|   Planning Phase   |
  +-----------------+      +--------------------+      +--------------------+
                                    | (Compress Context)     | (creates plan)
                                    v                        v
                         +-------------------+      +--------------------+
                         | CompressedAgent   |      |    SmartAgent      |----uses---->+-------------+
                         | (provides memory) |<-----| (Execution Loop)   |             | TodoManager |
                         +-------------------+      +--------------------+<------------+-------------+
                                                          |                            | Agent         |
                                     +--------------------+--------------------------+ | Orchestrator  |
                                     | (delegates)        | (instructs)                | (LoopDetector)|
                                     v                    v                            +---------------+
                         +----------------------+      +-------------+      +----------------+
                         |    SubAgent          |----->|  ToolAgent  |----->| Tooling System |
                         | (for complex tasks)  |      +-------------+      +----------------+
                         +----------------------+
  ```

#### 2. The Session & Service Layer (The "Coordinator")

This layer acts as the central coordinator and safety guard between the UI and the Agentic Core.

- **`SessionService`**: The main entry point for any task. It receives the initial request from the UI, manages the conversation history, and orchestrates the overall process by invoking the `SmartAgent`.
- **Safety Services**: This layer provides critical safety features that make the agent's actions reliable and reversible.
  - **`SnapshotManager`**: Before a task begins, this service automatically creates a temporary Git commit of the current project state.
  - **`HITLManager` (Human-in-the-Loop)**: For any file-system modification, this service pauses execution and waits for explicit user approval before proceeding.

#### 3. The Tooling System (The "Hands")

This module provides the agents with the ability to interact with the developer's environment.

- **Core Principle: Shell First**: The primary and most powerful tool is the `ShellExecutor`. This design choice is intentional, as it allows the agent to behave like a human developer—using `ls`, `grep`, `cat`, and `git` to explore, analyze, and interact with the project.
- **Specialized Tools**: For operations where shell commands are unsafe or inefficient (like applying a complex patch), dedicated tools (`apply_patch`) are used instead.
- **Security**: The **`SecurityPolicyEngine`** acts as a final gatekeeper, validating every shell command against configurable security rules before it is executed.

#### 4. The CLI Front-End (The "Interface")

The UI is a terminal application built with **React and the Ink library**.

- **Event-Driven and Decoupled**: The UI is completely decoupled from the backend logic. It simply subscribes to a `UIEventEmitter` and renders the stream of events (e.g., `TaskStarted`, `ToolExecutionCompleted`, `ThoughtGenerated`) that are emitted by the backend services and agents.
