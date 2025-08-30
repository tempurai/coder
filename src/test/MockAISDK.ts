import { MOCK_LLM_RESPONSES, MOCK_TOOL_RESPONSES } from './config.js';

/**
 * Mock implementation of AI SDK generateText for testing
 */
export class MockAISDK {
  private static instance: MockAISDK;
  private callHistory: Array<{
    prompt: string;
    system?: string;
    tools?: any;
    timestamp: Date;
  }> = [];
  private responseIndex = 0;
  private mockToolExecutions: Record<string, any> = {};
  private nextResponse: string | null = null;
  private nextError: Error | null = null;
  private nextToolResponse: { [toolName: string]: any } = {};
  private nextToolError: { [toolName: string]: Error } = {};
  private nextDelay: number = 0;

  static getInstance(): MockAISDK {
    if (!MockAISDK.instance) {
      MockAISDK.instance = new MockAISDK();
    }
    return MockAISDK.instance;
  }

  /**
   * Create a mock language model
   */
  createMockModel() {
    return {
      provider: 'openai',
      modelId: 'gpt-4o-mini',
      settings: {},
      specificationVersion: '2',
      supportedUrls: [],
      doGenerate: async () => ({ text: 'Mock response' }),
      doStream: async function* () { yield { text: 'Mock response' }; }
    };
  }

  /**
   * Reset mock state for a new test
   */
  reset(): void {
    this.callHistory = [];
    this.responseIndex = 0;
    this.mockToolExecutions = {};
    this.nextResponse = null;
    this.nextError = null;
    this.nextToolResponse = {};
    this.nextToolError = {};
    this.nextDelay = 0;
  }

  /**
   * Mock generateText function that returns predefined responses
   */
  async generateText(options: {
    model?: any;
    system?: string;
    prompt: string;
    tools?: any;
    maxOutputTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; toolCalls?: any[] }> {
    // Add delay if specified
    if (this.nextDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.nextDelay));
      this.nextDelay = 0;
    }

    // Handle error simulation
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }

    // Record the call
    this.callHistory.push({
      prompt: options.prompt,
      system: options.system,
      tools: options.tools,
      timestamp: new Date()
    });

    // Return predetermined response or determine based on content
    let response = MOCK_LLM_RESPONSES.SIMPLE_TASK;

    if (this.nextResponse) {
      return { text: this.nextResponse, toolCalls: [] };
    }

    if (options.prompt.toLowerCase().includes('read') || options.prompt.toLowerCase().includes('file')) {
      response = MOCK_LLM_RESPONSES.READ_FILE_TASK;
    } else if (options.prompt.toLowerCase().includes('analyze') || options.prompt.toLowerCase().includes('code')) {
      response = MOCK_LLM_RESPONSES.CODE_ANALYSIS_TASK;
    } else if (options.prompt.toLowerCase().includes('complex') || options.prompt.toLowerCase().includes('multi')) {
      response = MOCK_LLM_RESPONSES.MULTI_STEP_TASK;
    } else if (options.prompt.toLowerCase().includes('error') || options.prompt.toLowerCase().includes('fail')) {
      response = MOCK_LLM_RESPONSES.ERROR_RESPONSE;
    }

    // Simulate some processing delay
    await new Promise(resolve => setTimeout(resolve, 10));

    return {
      text: response.text,
      toolCalls: [] // We'll handle tool calls through our mock tools
    };
  }

  /**
   * Mock tool execution
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    // Handle tool error simulation
    if (this.nextToolError[toolName]) {
      const error = this.nextToolError[toolName];
      delete this.nextToolError[toolName];
      throw error;
    }

    // Record tool execution
    this.mockToolExecutions[toolName] = this.mockToolExecutions[toolName] || [];
    this.mockToolExecutions[toolName].push({
      args,
      timestamp: new Date()
    });

    // Get predetermined response or default
    const result = this.nextToolResponse[toolName] || 
                   MOCK_TOOL_RESPONSES[toolName as keyof typeof MOCK_TOOL_RESPONSES] || 
                   { success: true };
    delete this.nextToolResponse[toolName];

    // Return mock response based on tool name
    if (result) {
      return {
        ...result,
        args_received: args,
        execution_id: Math.random().toString(36).substr(2, 9)
      };
    }

    // Default response for unknown tools
    return {
      success: false,
      error: `Mock: Unknown tool '${toolName}'`,
      args_received: args
    };
  }

  // Control methods for tests
  setNextResponse(response: string) {
    this.nextResponse = response;
  }

  setNextError(error: Error) {
    this.nextError = error;
  }

  setNextToolResponse(toolName: string, response: any) {
    this.nextToolResponse[toolName] = response;
  }

  setNextToolError(toolName: string, error: Error) {
    this.nextToolError[toolName] = error;
  }

  setNextDelay(ms: number) {
    this.nextDelay = ms;
  }

  /**
   * Get call history for testing assertions
   */
  getCallHistory() {
    return [...this.callHistory];
  }

  /**
   * Get tool execution history
   */
  getToolExecutions() {
    return { ...this.mockToolExecutions };
  }

  getLastCall() {
    return this.callHistory[this.callHistory.length - 1];
  }

  getLastToolCall() {
    const allCalls = Object.entries(this.mockToolExecutions)
      .flatMap(([name, executions]) => 
        executions.map((exec: any) => ({ name, ...exec }))
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return allCalls.length > 0 ? { name: allCalls[0].name, args: allCalls[0].args } : null;
  }

  /**
   * Get statistics about mock usage
   */
  getStats() {
    return {
      totalCalls: this.callHistory.length,
      uniqueTools: Object.keys(this.mockToolExecutions).length,
      totalToolExecutions: Object.values(this.mockToolExecutions).reduce((acc, executions) => acc + executions.length, 0),
      averagePromptLength: this.callHistory.reduce((acc, call) => acc + call.prompt.length, 0) / Math.max(1, this.callHistory.length)
    };
  }
}

/**
 * Global mock instance for easy access in tests
 */
export const mockAISDK = MockAISDK.getInstance();