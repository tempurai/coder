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

// Mock ConfigLoader for tests
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

// Mock ToolAgent for tests  
class MockToolAgent extends ToolAgent {
  constructor() {
    // This will be called by the DI container, so we need to use super() with proper types
    // The actual dependencies will be injected by the container
    super(
      TEST_CONFIG,
      mockAISDK.createMockModel() as unknown as LanguageModel,
      {
        getToolNames: jest.fn().mockReturnValue([]),
        getTools: jest.fn().mockReturnValue([]),
        register: jest.fn(),
        registerMultiple: jest.fn(),
        getContext: jest.fn().mockReturnValue({})
      } as any,
      {
        getAbortSignal: jest.fn().mockReturnValue(new AbortController().signal),
        isInterrupted: jest.fn().mockReturnValue(false),
        startTask: jest.fn(),
        stopTask: jest.fn(),
        interrupt: jest.fn(),
        interrupted: false,
        abortController: new AbortController()
      } as any,
      {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        log: jest.fn()
      } as any
    );
  }

  override async initializeAsync(customContext?: string): Promise<void> {
    // Skip real initialization for tests
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

/**
 * Create test container with all required dependencies for SessionService testing
 */
export function createTestContainer(): Container {
  const container = new Container();

  // Bind configuration
  container.bind<any>(TYPES.Config).toConstantValue(TEST_CONFIG);

  // Bind mock language model
  container.bind<LanguageModel>(TYPES.LanguageModel).toDynamicValue(() => {
    return mockAISDK.createMockModel() as unknown as LanguageModel;
  }).inSingletonScope();

  // Bind mock config loader
  container.bind<ConfigLoader>(TYPES.ConfigLoader).to(MockConfigLoader).inSingletonScope();

  // Bind mock ToolRegistry
  container.bind(TYPES.ToolRegistry).toDynamicValue(() => ({
    getToolNames: jest.fn().mockReturnValue([]),
    getTools: jest.fn().mockReturnValue([]),
    register: jest.fn(),
    registerMultiple: jest.fn(),
    getContext: jest.fn().mockReturnValue({})
  })).inSingletonScope();

  // Bind mock InterruptService
  container.bind(TYPES.InterruptService).toDynamicValue(() => ({
    getAbortSignal: jest.fn().mockReturnValue(new AbortController().signal),
    isInterrupted: jest.fn().mockReturnValue(false),
    startTask: jest.fn(),
    stopTask: jest.fn(),
    interrupt: jest.fn(),
    interrupted: false,
    abortController: new AbortController()
  })).inSingletonScope();

  // Bind mock agent
  container.bind<ToolAgent>(TYPES.ToolAgent).to(MockToolAgent).inSingletonScope();

  // Bind file watcher service
  container.bind<FileWatcherService>(TYPES.FileWatcherService).to(FileWatcherService).inSingletonScope();

  // Bind event emitter
  container.bind<UIEventEmitter>(TYPES.UIEventEmitter).toDynamicValue(() => new UIEventEmitter()).inSingletonScope();

  // Mock factories that return promises
  container.bind(TYPES.SnapshotManagerFactory).toDynamicValue(() => {
    return async () => ({
      initialize: jest.fn(),
      createSnapshot: jest.fn().mockResolvedValue({
        success: true,
        snapshotId: 'test-snapshot-id',
        description: 'Test snapshot',
        filesCount: 5
      }),
      restoreSnapshot: jest.fn().mockResolvedValue({
        success: true,
        restoredFiles: 5
      }),
      listSnapshots: jest.fn().mockResolvedValue([]),
      cleanupOldSnapshots: jest.fn().mockResolvedValue(0),
      getStatus: jest.fn().mockResolvedValue({
        initialized: true,
        shadowRepoExists: true,
        snapshotCount: 1,
        latestSnapshot: { id: 'test-snapshot-id' }
      }),
      cleanup: jest.fn()
    }) as any;
  });

  // SessionService factory
  container.bind(TYPES.InitializedSessionService).toDynamicValue(() => {
    return async () => {
      const agent = container.get<ToolAgent>(TYPES.ToolAgent);
      const fileWatcher = container.get<FileWatcherService>(TYPES.FileWatcherService);
      const config = container.get<any>(TYPES.Config);
      const snapshotManagerFactory = container.get(TYPES.SnapshotManagerFactory) as any;
      const eventEmitter = container.get<UIEventEmitter>(TYPES.UIEventEmitter);
      const interruptService = container.get(TYPES.InterruptService) as any;
      const toolRegistry = container.get(TYPES.ToolRegistry) as any;

      const sessionService = new SessionService(
        agent,
        fileWatcher,
        config,
        snapshotManagerFactory,
        eventEmitter,
        interruptService,
        toolRegistry
      );

      // Initialize the agent
      await agent.initializeAsync();

      return sessionService;
    };
  });

  return container;
}