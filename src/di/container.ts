import 'reflect-metadata';
import { Container } from 'inversify';
import { Config, ConfigLoader } from '../config/ConfigLoader.js';
import { DefaultModelFactory } from '../models/index.js';
import { ToolAgent } from '../agents/tool_agent/ToolAgent.js';
import { SmartAgent } from '../agents/smart_agent/SmartAgent.js';
import { AgentOrchestrator } from '../agents/smart_agent/AgentOrchestrator.js';
import { TodoManager } from '../agents/smart_agent/TodoManager.js';
import { SubAgent } from '../agents/smart_agent/SubAgent.js';
import { SessionService } from '../services/SessionService.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { ISnapshotManagerFactory } from './interfaces.js';
import { TYPES } from './types.js';
import type { LanguageModel } from 'ai';
import { HITLManager } from '../services/HITLManager.js';

export { TYPES } from './types.js';

export function createContainer(): Container {
  const container = new Container();

  // --- Core Configuration ---
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

  // --- Supporting Services ---
  container.bind<UIEventEmitter>(TYPES.UIEventEmitter).toDynamicValue(() => new UIEventEmitter()).inSingletonScope();
  container.bind<FileWatcherService>(TYPES.FileWatcherService).to(FileWatcherService).inSingletonScope();

  // --- Core Agents (in dependency order) ---

  // ToolAgent - 基础工具代理，不依赖其他 Agent
  container.bind<ToolAgent>(TYPES.ToolAgent).to(ToolAgent).inSingletonScope();

  // :TodoManager - 独立的任务管理器
  container.bind<TodoManager>(TYPES.TodoManager).to(TodoManager).inSingletonScope();

  // AgentOrchestrator - 需要 ToolAgent 和 UIEventEmitter
  container.bind<AgentOrchestrator>(TYPES.AgentOrchestrator).to(AgentOrchestrator).inSingletonScope();

  // SubAgent - 需要 ToolAgent 和 UIEventEmitter  
  container.bind<SubAgent>(TYPES.SubAgent).to(SubAgent).inSingletonScope();

  // SmartAgent - 需要 ToolAgent 和 UIEventEmitter，会内部创建其他组件
  container.bind<SmartAgent>(TYPES.SmartAgent).to(SmartAgent).inSingletonScope();

  // --- Core Services ---
  container.bind<SessionService>(TYPES.SessionService).to(SessionService).inSingletonScope();

  container.bind<HITLManager>(TYPES.HITLManager).to(HITLManager).inSingletonScope();

  // --- Factories ---
  container.bind<ISnapshotManagerFactory>(TYPES.SnapshotManagerFactory)
    .toFactory(() => {
      return async (projectRoot?: string) => {
        const { SnapshotManager } = await import('../services/SnapshotManager.js');
        return new SnapshotManager(projectRoot || process.cwd());
      };
    });

  // 创建工厂来确保 ToolAgent 完成异步初始化
  container.bind<() => Promise<ToolAgent>>(TYPES.InitializedToolAgent)
    .toFactory(() => {
      let initializedAgent: ToolAgent | null = null;
      return async () => {
        if (initializedAgent) return initializedAgent;

        const agent = container.get<ToolAgent>(TYPES.ToolAgent);
        console.log('✅ ToolAgent已创建，开始异步初始化...');
        await agent.initializeAsync();
        console.log('✅ ToolAgent异步初始化完成');
        initializedAgent = agent;
        return agent;
      };
    });

  // 创建工厂来确保 SmartAgent 完成异步初始化
  container.bind<() => Promise<SmartAgent>>(TYPES.InitializedSmartAgent)
    .toFactory(() => {
      let initializedAgent: SmartAgent | null = null;
      return async () => {
        if (initializedAgent) return initializedAgent;

        // 首先确保 ToolAgent 已初始化
        const toolAgentFactory = container.get<() => Promise<ToolAgent>>(TYPES.InitializedToolAgent);
        await toolAgentFactory();

        const smartAgent = container.get<SmartAgent>(TYPES.SmartAgent);
        console.log('✅ SmartAgent已创建，开始初始化工具...');
        smartAgent.initializeTools();
        console.log('✅ SmartAgent工具初始化完成');
        initializedAgent = smartAgent;
        return smartAgent;
      };
    });

  // 创建工厂来获取完全初始化好的 SessionService
  container.bind<() => Promise<SessionService>>(TYPES.InitializedSessionService)
    .toFactory(() => {
      return async () => {
        // 确保所有依赖的 Agent 都已初始化
        const toolAgentFactory = container.get<() => Promise<ToolAgent>>(TYPES.InitializedToolAgent);
        const smartAgentFactory = container.get<() => Promise<SmartAgent>>(TYPES.InitializedSmartAgent);

        await Promise.all([
          toolAgentFactory(),
          smartAgentFactory()
        ]);

        const sessionService = container.get<SessionService>(TYPES.SessionService);
        console.log('✅ 会话管理服务已初始化');
        return sessionService;
      };
    });

  console.log('🏗️ 依赖注入容器已配置完成');
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