import { Container } from 'inversify';
import 'reflect-metadata';
import { TYPES } from '../di/types.js';
import { TEST_CONFIG } from './config.js';
import { mockAISDK } from './MockAISDK.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { ToolAgent } from '../agents/tool_agent/ToolAgent.js';
import { SessionService } from '../services/SessionService.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { UIEventEmitter } from '../events/index.js';
import type { LanguageModel } from 'ai';

class MockConfigLoader extends ConfigLoader {
  override reloadConfig(): any {
    return TEST_CONFIG;
  }

  getSystemPrompt(): string {
    return 'You are a helpful AI assistant for testing.';
  }

  isMcpEnabled(): boolean {
    return false;
  }

  override validateConfig() {
    return { isValid: true, errors: [] };
  }

  override getModelDisplayName(): string {
    return 'mock:gpt-4o-mini';
  }
}

class MockToolAgent extends ToolAgent {
  constructor() {
    // Call parent constructor with all required parameters including UIEventEmitter and Logger
    super(
      TEST_CONFIG,
      mockAISDK.createMockModel() as unknown as LanguageModel,
      {
        getToolNames: jest.fn().mockReturnValue([]),
        getAll: jest.fn().mockReturnValue({}),
        get: jest.fn(),
        register: jest.fn(),
        registerMultiple: jest.fn(),
        getContext: jest.fn().mockReturnValue({
          configLoader: {},
          securityEngine: {},
          eventEmitter: {},
          hitlManager: {}
        })
      } as any,
      {
        getAbortSignal: jest.fn().mockReturnValue(new AbortController().signal),
        isInterrupted: jest.fn().mockReturnValue(false),
        startTask: jest.fn(),
        interrupt: jest.fn(),
        reset: jest.fn()
      } as any,
      {
        emit: jest.fn(),
        on: jest.fn(),
        onAll: jest.fn(),
        once: jest.fn(),
        clear: jest.fn(),
        getListenerCount: jest.fn().mockReturnValue(0),
        getSessionId: jest.fn().mockReturnValue('test-session')
      } as any,
      {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
        setLogLevel: jest.fn(),
        restoreConsole: jest.fn(),
        cleanupOldLogs: jest.fn()
      } as any
    );
  }

  override async initializeAsync(customContext?: string): Promise<void> {
    // Mock implementation
    return Promise.resolve();
  }

  async processInput(
    input: string,
    files: string[] = [],
    progressCallback?: (chunk: any) => void,
    eventCallback?: (event: any) => void
  ): Promise<string> {
    const result = await mockAISDK.generateText({
      prompt: input,
      system: 'You are a helpful AI assistant for testing.'
    });
    return result.text;
  }

  async processInputStream(
    input: string,
    files: string[] = [],
    progressCallback?: (chunk: any) => void,
    eventCallback?: (event: any) => void
  ): Promise<AsyncIterable<string>> {
    const response = await this.processInput(input, files, progressCallback, eventCallback);
    return (async function* () {
      yield response;
    })();
  }
}

export function createTestContainer(): Container {
  const container = new Container();

  // Config bindings
  container.bind<any>(TYPES.Config).toConstantValue(TEST_CONFIG);

  // Model bindings
  container.bind<LanguageModel>(TYPES.LanguageModel).toDynamicValue(() => {
    return mockAISDK.createMockModel() as unknown as LanguageModel;
  }).inSingletonScope();

  // ConfigLoader binding
  container.bind<ConfigLoader>(TYPES.ConfigLoader).to(MockConfigLoader).inSingletonScope();

  // ToolRegistry binding
  container.bind(TYPES.ToolRegistry).toDynamicValue(() => ({
    getToolNames: jest.fn().mockReturnValue([]),
    getAll: jest.fn().mockReturnValue({}),
    get: jest.fn(),
    register: jest.fn(),
    registerMultiple: jest.fn(),
    getContext: jest.fn().mockReturnValue({})
  })).inSingletonScope();

  // InterruptService binding
  container.bind(TYPES.InterruptService).toDynamicValue(() => ({
    getAbortSignal: jest.fn().mockReturnValue(new AbortController().signal),
    isInterrupted: jest.fn().mockReturnValue(false),
    startTask: jest.fn(),
    stopTask: jest.fn(),
    interrupt: jest.fn(),
    interrupted: false,
    abortController: new AbortController(),
    reset: jest.fn()
  })).inSingletonScope();

  // CompressorService binding
  container.bind(TYPES.CompressorService).toDynamicValue(() => ({
    compressContextIfNeeded: jest.fn().mockResolvedValue(true),
    compressContext: jest.fn().mockResolvedValue('compressed'),
    getCompressionStats: jest.fn().mockReturnValue({}),
    reset: jest.fn()
  })).inSingletonScope();

  // EditModeManager binding
  container.bind(TYPES.EditModeManager).toDynamicValue(() => ({
    getCurrentMode: jest.fn().mockReturnValue('normal'),
    setMode: jest.fn(),
    cycleMode: jest.fn(),
    getModeInfo: jest.fn().mockReturnValue({ mode: 'normal', displayName: 'Normal' }),
    checkEditPermission: jest.fn().mockReturnValue({ allowed: true }),
    rememberEditApproval: jest.fn(),
    getStatusMessage: jest.fn().mockReturnValue('Normal mode'),
    getApprovalCount: jest.fn().mockReturnValue(0),
    reset: jest.fn()
  })).inSingletonScope();

  // TodoManager binding
  container.bind(TYPES.TodoManager).toDynamicValue(() => ({
    createTool: jest.fn().mockReturnValue({
      description: 'Mock todo manager',
      inputSchema: {},
      execute: jest.fn().mockResolvedValue({ success: true })
    }),
    createPlan: jest.fn().mockReturnValue({ success: true }),
    addTodo: jest.fn().mockReturnValue({ success: true }),
    getAllTodos: jest.fn().mockReturnValue([]),
    getPlan: jest.fn().mockReturnValue(null)
  })).inSingletonScope();

  // ToolAgent binding
  container.bind<ToolAgent>(TYPES.ToolAgent).to(MockToolAgent).inSingletonScope();

  // FileWatcherService binding
  container.bind<FileWatcherService>(TYPES.FileWatcherService).to(FileWatcherService).inSingletonScope();

  // UIEventEmitter binding
  container.bind<UIEventEmitter>(TYPES.UIEventEmitter).toDynamicValue(() => new UIEventEmitter()).inSingletonScope();

  // SessionServiceFactory binding
  container.bind(TYPES.SessionServiceFactory).toDynamicValue(() => {
    return () => {
      const agent = container.get<ToolAgent>(TYPES.ToolAgent);
      const fileWatcher = container.get<FileWatcherService>(TYPES.FileWatcherService);
      const config = container.get<any>(TYPES.Config);
      const eventEmitter = container.get<UIEventEmitter>(TYPES.UIEventEmitter);
      const interruptService = container.get(TYPES.InterruptService) as any;
      const toolRegistry = container.get(TYPES.ToolRegistry) as any;
      const todoManager = container.get(TYPES.TodoManager) as any;
      const compressorService = container.get(TYPES.CompressorService) as any;
      const editModeManager = container.get(TYPES.EditModeManager) as any;

      const sessionService = new SessionService(
        agent,
        fileWatcher,
        config,
        eventEmitter,
        interruptService,
        toolRegistry,
        todoManager,
        compressorService,
        editModeManager
      );

      return {
        sessionService,
        clearSession: () => {
          sessionService.clearSession();
          interruptService.reset?.();
          editModeManager.reset?.();
        }
      };
    };
  });

  return container;
}