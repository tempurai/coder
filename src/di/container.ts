import 'reflect-metadata';
import { Container } from 'inversify';
import { Config, ConfigLoader } from '../config/ConfigLoader.js';
import { DefaultModelFactory } from '../models/index.js';
import { ToolAgent } from '../agents/tool_agent/ToolAgent.js';
import { SmartAgent } from '../agents/smart_agent/SmartAgent.js';
import { AgentOrchestrator } from '../agents/smart_agent/AgentOrchestrator.js';
import { TodoManager } from '../agents/smart_agent/TodoManager.js';
import { SubAgent } from '../agents/smart_agent/SubAgent.js';
import { CompressedAgent } from '../agents/compressed_agent/CompressedAgent.js';
import { SessionService } from '../services/SessionService.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { SessionServiceFactory } from './interfaces.js';
import { TYPES } from './types.js';
import type { LanguageModel } from 'ai';
import { HITLManager } from '../services/HITLManager.js';
import { InterruptService } from '../services/InterruptService.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { SecurityPolicyEngine } from '../security/SecurityPolicyEngine.js';
import { Logger } from '../utils/Logger.js';
import { CompressorService } from '../services/CompressorService.js';
import { EditModeManager } from '../services/EditModeManager.js';
import { ToolInterceptor } from '../agents/smart_agent/ToolInterceptor.js';
import { ProjectIndexer } from '../indexing/ProjectIndexer.js';

export { TYPES } from './types.js';

export function createContainer(): Container {
  const container = new Container();

  // Configuration
  container.bind<ConfigLoader>(TYPES.ConfigLoader).to(ConfigLoader).inSingletonScope();
  container.bind<Config>(TYPES.Config)
    .toDynamicValue(() => {
      const configLoader = container.get<ConfigLoader>(TYPES.ConfigLoader);
      return configLoader.getConfig();
    })
    .inSingletonScope();

  container.bind<DefaultModelFactory>(TYPES.ModelFactory).to(DefaultModelFactory).inSingletonScope();
  container.bind<LanguageModel>(TYPES.LanguageModel)
    .toDynamicValue(async () => {
      const config = container.get<Config>(TYPES.Config);
      const modelFactory = container.get<DefaultModelFactory>(TYPES.ModelFactory);

      if (!config.models || config.models.length === 0) {
        throw new Error('No models configured. Please add at least one model to your configuration.');
      }

      const firstModel = config.models[0];
      console.log('🔄 正在初始化AI模型...');
      const model = await modelFactory.createModel(firstModel);
      console.log(`✅ 模型已初始化: ${firstModel.provider}:${firstModel.name}`);
      return model;
    })
    .inSingletonScope();

  // Core services
  container.bind<UIEventEmitter>(TYPES.UIEventEmitter).toDynamicValue(() => new UIEventEmitter()).inSingletonScope();
  container.bind<FileWatcherService>(TYPES.FileWatcherService).to(FileWatcherService).inSingletonScope();
  container.bind<Logger>(TYPES.Logger).to(Logger).inSingletonScope();
  container.bind<SecurityPolicyEngine>(TYPES.SecurityPolicyEngine).to(SecurityPolicyEngine).inSingletonScope();
  container.bind<ToolRegistry>(TYPES.ToolRegistry).to(ToolRegistry).inSingletonScope();

  // Request-scoped services
  container.bind<InterruptService>(TYPES.InterruptService).to(InterruptService).inRequestScope();
  container.bind<EditModeManager>(TYPES.EditModeManager).to(EditModeManager).inRequestScope();
  container.bind<HITLManager>(TYPES.HITLManager).to(HITLManager).inRequestScope();
  container.bind<CompressorService>(TYPES.CompressorService).to(CompressorService).inRequestScope();

  // Agents and managers
  container.bind<TodoManager>(TYPES.TodoManager).to(TodoManager).inSingletonScope();

  // Tool agents
  container.bind<ToolAgent>(TYPES.ToolAgent).to(ToolAgent);
  container.bind<ToolInterceptor>(TYPES.ToolInterceptor).to(ToolInterceptor);

  // AI agents
  container.bind<SmartAgent>(TYPES.SmartAgent).to(SmartAgent);
  container.bind<AgentOrchestrator>(TYPES.AgentOrchestrator).to(AgentOrchestrator);
  container.bind<SubAgent>(TYPES.SubAgent).to(SubAgent);
  container.bind<CompressedAgent>(TYPES.CompressedAgent).to(CompressedAgent);

  // Indexing services
  container.bind<ProjectIndexer>(TYPES.ProjectIndexer).to(ProjectIndexer).inSingletonScope();

  // Session factory
  container.bind<SessionServiceFactory>(TYPES.SessionServiceFactory)
    .toFactory(() => {
      return () => {
        const toolAgent = container.get<ToolAgent>(TYPES.ToolAgent);
        const fileWatcherService = container.get<FileWatcherService>(TYPES.FileWatcherService);
        const config = container.get<Config>(TYPES.Config);
        const eventEmitter = container.get<UIEventEmitter>(TYPES.UIEventEmitter);
        const interruptService = container.get<InterruptService>(TYPES.InterruptService);
        const toolRegistry = container.get<ToolRegistry>(TYPES.ToolRegistry);
        const todoManager = container.get<TodoManager>(TYPES.TodoManager);
        const compressorService = container.get<CompressorService>(TYPES.CompressorService);
        const editModeManager = container.get<EditModeManager>(TYPES.EditModeManager);

        const sessionService = new SessionService(
          toolAgent,
          fileWatcherService,
          config,
          eventEmitter,
          interruptService,
          toolRegistry,
          todoManager,
          compressorService,
          editModeManager,
        );

        return {
          sessionService,
          clearSession(): void {
            sessionService.clearSession();
            interruptService.reset();
            editModeManager.reset();
          }
        };
      };
    });

  console.log('依赖注入容器已配置完成');
  return container;
}

let _container: Container | null = null;

export function getContainer(): Container {
  if (!_container) {
    _container = createContainer();
  }
  return _container;
}

export function resetContainer(): void {
  if (_container) {
    _container.unbindAll();
    _container = null;
  }
}