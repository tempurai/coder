import { Config } from '../config/ConfigLoader.js';

/**
 * Test configuration for SessionService e2e tests
 * Uses mocked LLM and configured for testing
 */
export const TEST_CONFIG: Config = {
  model: {
    provider: 'openai',
    name: 'gpt-4o-mini',
    apiKey: 'test-mock-key',
    baseUrl: 'http://localhost:3001/v1', // Mock server URL
    options: {}
  },
  temperature: 0.1,
  maxTokens: 1000,
  tools: {
    shellExecutor: {
      defaultTimeout: 5000,
      maxRetries: 1,
      security: {
        allowlist: ['echo', 'cat', 'ls'],
        blocklist: [],
        allowUnlistedCommands: false,
        allowDangerousCommands: false
      }
    },
    webTools: {
      requestTimeout: 5000,
      maxContentLength: 5000,
      userAgent: 'Test-Agent/1.0',
      enableCache: false
    }
  },
  customContext: 'This is a test environment for automated testing.',
  mcpServers: {}
};

/**
 * Mock LLM responses for different scenarios
 */
export const MOCK_LLM_RESPONSES = {
  // Simple task completion
  SIMPLE_TASK: {
    text: `<response>
  <thought>
    I need to handle a simple test task. This appears to be a basic request that I can complete immediately.
  </thought>
  <plan>
    <task>Handle simple test task</task>
    <status>completed</status>
    <updated>${new Date().toISOString()}</updated>
    <steps>
      <step priority="high">Task completed successfully</step>
    </steps>
    <notes>This was a simple test task that required no additional actions.</notes>
  </plan>
  <action>
    <tool>finish</tool>
    <args>{}</args>
  </action>
</response>`
  },

  // File reading task
  READ_FILE_TASK: {
    text: `<response>
  <thought>
    I need to read a file to understand its contents. Let me use the read_file tool to accomplish this.
  </thought>
  <plan>
    <task>Read file contents</task>
    <status>implementing</status>
    <updated>${new Date().toISOString()}</updated>
    <steps>
      <step priority="high">Read the specified file</step>
      <step priority="medium">Analyze file contents</step>
      <step priority="low">Provide summary</step>
    </steps>
    <notes>Using read_file tool to access file contents.</notes>
  </plan>
  <action>
    <tool>read_file</tool>
    <args>{"file_path": "test.txt"}</args>
  </action>
</response>`
  },

  // Code analysis task
  CODE_ANALYSIS_TASK: {
    text: `<response>
  <thought>
    I need to analyze the code structure to understand the project layout and identify key components.
  </thought>
  <plan>
    <task>Analyze project code structure</task>
    <status>analyzing</status>
    <updated>${new Date().toISOString()}</updated>
    <steps>
      <step priority="high">Get project structure</step>
      <step priority="medium">Analyze key files</step>
      <step priority="low">Provide insights</step>
    </steps>
    <notes>Starting with project structure analysis.</notes>
  </plan>
  <action>
    <tool>get_project_structure</tool>
    <args>{"max_depth": 3}</args>
  </action>
</response>`
  },

  // Multi-step task
  MULTI_STEP_TASK: {
    text: `<response>
  <thought>
    This is a complex task that will require multiple steps. Let me start by understanding the current project state.
  </thought>
  <plan>
    <task>Execute multi-step development task</task>
    <status>planning</status>
    <updated>${new Date().toISOString()}</updated>
    <steps>
      <step priority="high">Analyze current state</step>
      <step priority="high">Plan implementation approach</step>
      <step priority="medium">Execute changes</step>
      <step priority="medium">Test changes</step>
      <step priority="low">Document results</step>
    </steps>
    <notes>Starting with project analysis to understand current state.</notes>
  </plan>
  <action>
    <tool>analyze_code_structure</tool>
    <args>{"target_path": "src", "analysis_depth": "detailed"}</args>
  </action>
</response>`
  },

  // Error scenario
  ERROR_RESPONSE: {
    text: `<response>
  <thought>
    I encountered an error while processing this request. I should report this issue and suggest alternatives.
  </thought>
  <plan>
    <task>Handle error scenario</task>
    <status>error</status>
    <updated>${new Date().toISOString()}</updated>
    <steps>
      <step priority="high">Report error details</step>
      <step priority="medium">Suggest alternatives</step>
    </steps>
    <notes>An error occurred during processing. Need to provide helpful error information.</notes>
  </plan>
  <action>
    <tool>finish</tool>
    <args>{"error": "Simulated error for testing purposes", "success": false}</args>
  </action>
</response>`
  }
};

/**
 * Mock tool responses for testing
 */
export const MOCK_TOOL_RESPONSES = {
  read_file: {
    success: true,
    content: "This is mock file content for testing purposes.",
    path: "test.txt",
    size: 45
  },

  write_file: {
    success: true,
    message: "File written successfully",
    path: "test-output.txt",
    bytes_written: 100
  },

  get_project_structure: {
    success: true,
    structure: {
      "src/": {
        "agents/": ["SimpleAgent.ts", "ReActAgent.ts"],
        "session/": ["SessionService.ts"],
        "config/": ["ConfigLoader.ts"],
        "test/": ["SessionService.test.ts"]
      }
    },
    total_files: 5,
    total_directories: 4
  },

  analyze_code_structure: {
    success: true,
    analysis: {
      files_analyzed: 3,
      classes_found: 2,
      functions_found: 15,
      imports_count: 8,
      complexity_score: "moderate"
    },
    insights: ["Code is well-structured", "Good separation of concerns"]
  },

  shell_executor: {
    success: true,
    stdout: "Mock command executed successfully",
    stderr: "",
    exit_code: 0,
    execution_time: 150
  },

  finish: {
    success: true,
    message: "Task completed successfully",
    completed: true
  }
};