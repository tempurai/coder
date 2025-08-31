import { ToolAgent, Messages } from '../tool_agent/ToolAgent.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { z } from "zod";
import { SystemInfoEvent } from '../../events/EventTypes.js';
import { inject } from 'inversify';
import { TYPES } from '../../di/types.js';
import { tool } from 'ai';

export const SubAgentResponseSchema = z.object({
  reasoning: z.string().describe("Detailed explanation of current analysis and planned approach"),
  action: z.object({
    tool: z.string().describe("Tool name"),
    args: z.record(z.any()).default({})
  }),
  completed: z.boolean().default(false).describe("Whether the task has been completed"),
  output: z.any().optional().describe("Final result when completed"),
  criticalInfo: z.string().optional().describe("Critical information that needs to be preserved")
});

export type SubAgentResponse = z.infer<typeof SubAgentResponseSchema>;

const SUB_AGENT_PROMPT = `You are a specialized SubAgent designed to complete a specific focused task autonomously. You operate in non-interactive mode, meaning you cannot ask the user for input or clarification.

# Operating Principles
- **Goal-Oriented**: Focus solely on completing the specified task efficiently
- **Self-Contained**: Work with only the provided context and available tools
- **Autonomous Decision Making**: Make informed decisions based on available information
- **Systematic Approach**: Break down complex tasks into logical steps
- **Error Resilience**: Handle errors gracefully with alternative approaches
- **Shell-First Strategy**: Prefer basic shell commands (ls, find, cat, grep) for exploration and validation

# Context Information Management
- When you complete actions that change system state, include a brief summary in criticalInfo field
- Focus on file changes, errors, and important discoveries
- Ignore read-only operations like ls, cat, grep results unless they reveal critical issues
- Pay attention to any context guidance provided in the task description

# Execution Guidelines
1. **Analyze the Task**: Understand the objective, context, and available tools
2. **Plan Your Approach**: Determine the sequence of actions needed
3. **Execute Systematically**: Use tools methodically to accomplish the goal
4. **Adapt as Needed**: Adjust your approach based on tool results and obstacles
5. **Verify Progress**: Ensure each action contributes toward the goal
6. **Complete Thoroughly**: Don't finish until the objective is fully met

# Tool Usage Strategy
- **Shell Commands First**: For common operations like listing files (ls), checking status (git status), finding files (find), prefer shell_executor over specialized tools
- **Shell for Exploration**: Use shell commands to explore project structure, check file existence, run builds/tests
- **Shell for Testing and Validation**: Use shell commands to run tests, check code quality, and validate changes
- Handle tool errors by trying alternative approaches or modified parameters
- Use tool results to inform subsequent actions
- Prefer specific, targeted tool calls over broad, unfocused ones

# Quality Standards
- Produce accurate, high-quality results that meet the task requirements
- Follow established code conventions and patterns when working with code
- Document your reasoning for complex decisions
- Ensure completeness - don't leave tasks partially finished
- Verify your work before marking as complete

# Response Format
Always respond with valid JSON:
{
  "reasoning": "Detailed explanation of your current analysis, what you've learned, and your planned approach",
  "action": {
    "tool": "exact_tool_name",
    "args": { "parameter": "value" }
  },
  "completed": false,
  "output": null,
  "criticalInfo": "Brief summary of important changes or discoveries"
}

**When to Set "completed": true:**
- The specific task objective has been fully accomplished
- All requirements have been met
- Any verification steps have been completed successfully
- Include your final results/deliverables in the "output" field

**Special Actions:**
- Use "tool": "think" for pure reasoning when no tool execution is needed
- Use "tool": "finish" to explicitly signal task completion


# Examples

**Example 1: Code Analysis Task**
Task: "Analyze the authentication system and identify security issues"

{
  "reasoning": "I need to understand the project structure and locate authentication-related files. I'll start with basic exploration.",
  "action": {
    "tool": "shell_executor",
    "args": {
      "command": "find . -name '*auth*' -o -name '*login*' -o -name '*security*' | head -10",
      "description": "Find authentication-related files"
    }
  },
  "completed": false,
  "output": null,
  "criticalInfo": null
}

{
  "reasoning": "Found auth files. Now I need to examine them for security issues.",
  "action": {
    "tool": "shell_executor",
    "args": {
      "command": "cat src/auth.js | head -50",
      "description": "Read authentication implementation"
    }
  },
  "completed": false,
  "output": null,
  "criticalInfo": null
}

{
  "reasoning": "Analysis complete. Found several security concerns that need attention.",
  "action": {
    "tool": "finish",
    "args": {}
  },
  "completed": true,
  "output": {
    "summary": "Security analysis completed",
    "issues_found": ["Hardcoded secrets", "Missing input validation", "Weak password policy"],
    "files_analyzed": ["src/auth.js", "middleware/security.js"]
  },
  "criticalInfo": "Security analysis found 3 critical vulnerabilities in authentication system"
}

**Example 2: File Refactoring Task**
Task: "Convert callback functions to async/await"

{
  "reasoning": "I need to find the target files and understand the current callback patterns.",
  "action": {
    "tool": "shell_executor",
    "args": {
      "command": "find . -name '*.js' | grep -v node_modules | xargs grep -l 'callback\\|cb)'",
      "description": "Find JavaScript files using callbacks"
    }
  },
  "completed": false,
  "output": null,
  "criticalInfo": null
}

{
  "reasoning": "Found files with callbacks. I'll refactor the main service file to use async/await patterns.",
  "action": {
    "tool": "apply_patch",
    "args": {
      "filePath": "services/userService.js",
      "patchContent": "--- a/services/userService.js\n+++ b/services/userService.js\n@@ -1,8 +1,10 @@\n-function getUser(id, callback) {\n-  db.findById(id, (err, user) => {\n-    if (err) return callback(err);\n-    callback(null, user);\n-  });\n+async function getUser(id) {\n+  try {\n+    const user = await db.findById(id);\n+    return user;\n+  } catch (error) {\n+    throw error;\n+  }\n }"
    }
  },
  "completed": false,
  "output": null,
  "criticalInfo": "Applied patch to services/userService.js - converted callback to async/await"
}

{
  "reasoning": "Refactoring complete. Running tests to verify the changes work correctly.",
  "action": {
    "tool": "shell_executor",
    "args": {
      "command": "npm test",
      "description": "Run tests to verify refactored code"
    }
  },
  "completed": false,
  "output": null,
  "criticalInfo": null
}

{
  "reasoning": "Tests pass. Refactoring from callbacks to async/await is complete and verified.",
  "action": {
    "tool": "finish",
    "args": {}
  },
  "completed": true,
  "output": {
    "summary": "Successfully converted callbacks to async/await",
    "files_modified": ["services/userService.js", "utils/database.js"],
    "verification": "All tests passing"
  },
  "criticalInfo": "Refactoring completed - 2 files modified, all tests passing"
}

Remember: You are operating independently to accomplish a specific goal. Focus on delivering results efficiently and effectively while maintaining high quality standards. Use shell commands as your primary exploration and verification tool.`;

interface SubAgentTask {
  id: string;
  type: string;
  description: string;
  context: any;
  contextGuidance?: {
    focusAreas: string[];
    criticalTypes: string[];
    expectedOutputs: string[];
  };
  tools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
}

interface SubAgentResult {
  success: boolean;
  taskId: string;
  output: any;
  iterations: number;
  criticalInfo: string;
  duration: number;
  terminateReason: 'GOAL' | 'MAX_TURNS' | 'TIMEOUT' | 'ERROR';
  error?: string;
  logs: string[];
}

export class SubAgent {
  private readonly MAX_TURNS = 20;
  private readonly DEFAULT_TIMEOUT = 300000;

  constructor(
    @inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
  ) { }

  async executeTask(task: SubAgentTask): Promise<SubAgentResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const maxTurns = this.MAX_TURNS;
    const timeout = this.DEFAULT_TIMEOUT;

    logs.push(`Starting SubAgent task: ${task.type}`);
    console.log(`SubAgent executing: ${task.type} - ${task.description}`);

    this.eventEmitter.emit({
      type: 'system_info',
      level: 'info',
      message: `SubAgent started: ${task.type}`,
      context: { taskId: task.id, maxTurns, timeout },
    } as SystemInfoEvent);

    try {
      const result = await Promise.race([
        this.executeTaskLoop(task, maxTurns, logs),
        this.createTimeoutPromise(timeout)
      ]);

      const duration = Date.now() - startTime;
      logs.push(`Task ${result.success ? 'completed' : 'failed'} in ${duration}ms`);

      this.eventEmitter.emit({
        type: 'system_info',
        level: result.success ? 'info' : 'warning',
        message: `SubAgent ${result.success ? 'completed' : 'failed'}: ${task.type}`,
        context: { taskId: task.id, duration, iterations: result.iterations },
      } as SystemInfoEvent);

      return { ...result, taskId: task.id, duration, logs };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logs.push(`Task failed with error: ${errorMessage}`);

      return {
        success: false,
        taskId: task.id,
        output: null,
        iterations: 0,
        criticalInfo: `Task failed: ${errorMessage}`,
        duration,
        terminateReason: 'ERROR',
        error: errorMessage,
        logs
      };
    }
  }

  private async executeTaskLoop(task: SubAgentTask, maxTurns: number, logs: string[]) {
    const criticalInfoList: string[] = [];
    const conversationHistory: Messages = [
      { role: 'system', content: SUB_AGENT_PROMPT },
      {
        role: 'user',
        content: `Task: ${task.description}
Context: ${JSON.stringify(task.context, null, 2)}
Complete this task efficiently.`
          + (task.contextGuidance ? `

Context Guidance: ${JSON.stringify(task.contextGuidance, null, 2)}` : '')
      }
    ];

    let currentObservation = `Task: ${task.description}\nType: ${task.type}\nContext: ${JSON.stringify(task.context, null, 2)}`;
    let turnCount = 0;
    let taskCompleted = false;
    let finalOutput: any = null;

    while (!taskCompleted && turnCount < maxTurns) {
      turnCount++;
      logs.push(`Turn ${turnCount}: Processing observation`);

      try {
        conversationHistory.push({
          role: 'user',
          content: `Current observation: ${currentObservation}`
        });

        const response = await this.toolAgent.generateObject<SubAgentResponse>({
          messages: conversationHistory,
          schema: SubAgentResponseSchema as z.ZodSchema<SubAgentResponse>,
        });

        conversationHistory.push({
          role: 'assistant',
          content: JSON.stringify(response, null, 2)
        });

        logs.push(`Turn ${turnCount}: ${response.action.tool}`);

        if (response.criticalInfo) {
          criticalInfoList.push(response.criticalInfo);
        }

        if (response.completed || response.action.tool === 'finish') {
          taskCompleted = true;
          finalOutput = response.output || response.action.args;
          break;
        }

        if (response.action.tool === 'think') {
          currentObservation = `Previous: Reasoning completed\nThought: ${response.reasoning}`;
          continue;
        }

        if (task.tools && !task.tools.includes(response.action.tool)) {
          currentObservation = `Error: Tool ${response.action.tool} is not available for this specialized task`;
          continue;
        }

        try {
          const toolResult = await this.toolAgent.executeTool(response.action.tool, response.action.args);
          currentObservation = `Previous: ${response.action.tool}\nResult: ${JSON.stringify(toolResult, null, 2)}`;

          // Auto-preserve based on command classification
          if (this.shouldPreserveTool(response.action.tool, toolResult)) {
            const info = this.summarizeResult(response.action.tool, toolResult);
            criticalInfoList.push(info);
          }

        } catch (toolError) {
          const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown tool error';
          currentObservation = `Previous: ${response.action.tool}\nError: ${errorMessage}`;

          // Always preserve errors
          criticalInfoList.push(`ERROR ${response.action.tool}: ${errorMessage}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logs.push(`Turn ${turnCount}: Error: ${errorMessage}`);
        currentObservation = `Error occurred: ${errorMessage}`;
        if (turnCount >= maxTurns - 2) break;
      }
    }

    let terminateReason: 'GOAL' | 'MAX_TURNS' | 'ERROR';
    if (taskCompleted) {
      terminateReason = 'GOAL';
    } else if (turnCount >= maxTurns) {
      terminateReason = 'MAX_TURNS';
    } else {
      terminateReason = 'ERROR';
    }

    const criticalInfo = criticalInfoList.join('\n');

    return {
      success: taskCompleted,
      output: finalOutput,
      criticalInfo,
      iterations: turnCount,
      terminateReason
    };
  }

  private shouldPreserveTool(toolName: string, result: any): boolean {
    // Always preserve write operations
    if (['write_file', 'apply_patch'].includes(toolName)) {
      return true;
    }

    // Always preserve errors
    if (!result.success) {
      return true;
    }

    // For shell commands, check if it's a write operation
    if (toolName === 'shell_executor' || toolName === 'multi_command') {
      return result.commandClassification && !result.commandClassification.isReadOnly;
    }

    return false;
  }

  private summarizeResult(toolName: string, result: any): string {
    if (!result.success) {
      return `ERROR ${toolName}: ${result.error}`;
    }

    switch (toolName) {
      case 'write_file':
        return `Wrote file: ${result.filePath}`;
      case 'apply_patch':
        return `Applied patch to: ${result.filePath}`;
      case 'shell_executor':
        return `Executed (${result.commandClassification?.category}): ${result.command}`;
      default:
        return `${toolName}: completed`;
    }
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`SubAgent task timed out after ${timeoutMs}ms`)), timeoutMs);
    });
  }
}

export const createSubAgentTool = (toolAgent: ToolAgent, eventEmitter: UIEventEmitter) => {
  const startSubAgent = async (args: any): Promise<any> => {
    console.log('Starting sub-agent for specialized task');
    const subAgent = new SubAgent(toolAgent, eventEmitter);

    return await subAgent.executeTask({
      ...args,
      contextGuidance: args.contextGuidance || {
        focusAreas: ['file_changes', 'errors', 'build_results'],
        criticalTypes: ['write_operations', 'error_messages'],
        expectedOutputs: ['modified_files', 'error_details']
      }
    });
  }

  return tool({
    description: `Start a specialized sub-agent for focused, autonomous task execution. Use this for:
- Complex, isolated tasks that can be completed independently
- Tasks requiring deep focus without user interaction
- Specialized operations that benefit from dedicated execution context
- When you need to delegate a specific subtask while continuing with the main workflow
The sub-agent will work autonomously until task completion or failure.`,
    inputSchema: z.object({
      taskType: z.string().describe('Type of task (e.g., "file_analysis", "code_refactor", "testing")'),
      description: z.string().describe('Clear description of what the sub-agent should accomplish'),
      context: z.any().optional().describe('Any relevant context or data needed for the task'),
      contextGuidance: z.object({
        focusAreas: z.array(z.string()).optional().describe('Areas to pay special attention to'),
        criticalTypes: z.array(z.string()).optional().describe('Types of information to preserve'),
        expectedOutputs: z.array(z.string()).optional().describe('Expected output types')
      }).optional().describe('Guidance on what context information to preserve')
    }),
    execute: async (args) => {
      const taskId = `subagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const task = {
        id: taskId,
        type: args.taskType,
        description: args.description,
        context: args.context || {},
        contextGuidance: args.contextGuidance
      };

      try {
        const result = await startSubAgent(task);
        return {
          success: result.success,
          taskId: result.taskId,
          output: result.output,
          iterations: result.iterations,
          duration: result.duration,
          criticalInfo: result.criticalInfo,
          terminateReason: result.terminateReason,
          error: result.error,
          message: result.success
            ? `Sub-agent completed task "${args.taskType}" successfully in ${result.iterations} iterations`
            : `Sub-agent failed: ${result.error}`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: `Sub-agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}