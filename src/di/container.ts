import 'reflect-metadata';
import { Container } from 'inversify';
import { Config, ConfigLoader } from '../config/ConfigLoader.js';
import { DefaultModelFactory } from '../models/index.js';
import { ToolAgent } from '../agents/tool_agent/ToolAgent.js';
import { ReActAgent } from '../agents/react_agent/ReActAgent.js';
import { SessionService } from '../session/SessionService.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { ISnapshotManagerFactory } from './interfaces.js';
import { TYPES } from './types.js';
import type { LanguageModel } from 'ai';

export { TYPES } from './types.js';

export function createContainer(): Container {
  const container = new Container();

  container.bind<ConfigLoader>(TYPES.ConfigLoader)
    .to(ConfigLoader)
    .inSingletonScope();

  container.bind<Config>(TYPES.Config)
    .toDynamicValue(() => {
      const configLoader = container.get<ConfigLoader>(TYPES.ConfigLoader);
      return configLoader.getConfig();
    })
    .inSingletonScope();

  container.bind<DefaultModelFactory>(TYPES.ModelFactory)
    .to(DefaultModelFactory)
    .inSingletonScope();

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

  container.bind<FileWatcherService>(TYPES.FileWatcherService)
    .to(FileWatcherService)
    .inSingletonScope();

  container.bind<ToolAgent>(TYPES.ToolAgent)
    .to(ToolAgent)
    .inSingletonScope();

  container.bind<UIEventEmitter>(TYPES.UIEventEmitter)
    .to(UIEventEmitter)
    .inSingletonScope();

  container.bind<SessionService>(TYPES.SessionService)
    .to(SessionService)
    .inSingletonScope();

  container.bind<ISnapshotManagerFactory>(TYPES.SnapshotManagerFactory)
    .toFactory(() => {
      return async (projectRoot?: string) => {
        const { SnapshotManager } = await import('../services/SnapshotManager.js');
        return new SnapshotManager(projectRoot || process.cwd());
      };
    });

  // 创建一个工厂来确保 ToolAgent 在被使用前已完成异步初始化
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

  // 创建一个工厂来获取完全初始化好的 SessionService
  container.bind<() => Promise<SessionService>>(TYPES.InitializedSessionService)
    .toFactory(() => {
      return async () => {
        const agentFactory = container.get<() => Promise<ToolAgent>>(TYPES.InitializedToolAgent);
        await agentFactory(); // 确保 ToolAgent 已初始化
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