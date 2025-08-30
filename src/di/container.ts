import 'reflect-metadata';
import { Container } from 'inversify';
import { Config, ConfigLoader } from '../config/ConfigLoader.js';
import { DefaultModelFactory } from '../models/index.js';
import { SimpleAgent } from '../agents/SimpleAgent.js';
import { ReActAgent } from '../agents/ReActAgent.js';
import { SessionService } from '../session/SessionService.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { IReActAgentFactory, ISnapshotManagerFactory } from './interfaces.js';
import { TYPES } from './types.js';
import type { LanguageModel } from 'ai';

// Re-export TYPES for backward compatibility
export { TYPES } from './types.js';

/**
 * 创建和配置依赖注入容器
 * @returns 配置好的Container实例
 */
export function createContainer(): Container {
  const container = new Container();

  // 1) 配置相关 - 标准构造函数注入
  container.bind<ConfigLoader>(TYPES.ConfigLoader)
    .to(ConfigLoader)
    .inSingletonScope();

  container.bind<Config>(TYPES.Config)
    .toDynamicValue(() => {
      const configLoader = container.get<ConfigLoader>(TYPES.ConfigLoader);
      return configLoader.getConfig();
    })
    .inSingletonScope();

  // 2) 模型工厂 - 负责创建各种AI模型
  container.bind<DefaultModelFactory>(TYPES.ModelFactory)
    .to(DefaultModelFactory)
    .inSingletonScope();

  // 3) 语言模型 - 通过ModelFactory创建，使用第一个模型配置
  container.bind<LanguageModel>(TYPES.LanguageModel)
    .toDynamicValue(async () => {
      const config = container.get<Config>(TYPES.Config);
      const modelFactory = container.get<DefaultModelFactory>(TYPES.ModelFactory);
      
      if (!config.models || config.models.length === 0) {
        throw new Error('No models configured. Please add at least one model to the models array in your configuration.');
      }
      
      const firstModel = config.models[0];
      console.log('🔄 正在初始化AI模型...');
      const model = await modelFactory.createModel(firstModel);
      console.log(`✅ 模型已初始化: ${firstModel.provider}:${firstModel.name}`);
      return model;
    })
    .inSingletonScope();

  // 4) 文件监听服务 - 使用toDynamicValue配置默认选项
  container.bind<FileWatcherService>(TYPES.FileWatcherService)
    .toDynamicValue(() => {
      const fileWatcherService = new FileWatcherService({
        verbose: false,
        debounceMs: 500,
        maxWatchedFiles: 50,
      });
      console.log('✅ 文件监听服务已创建');
      return fileWatcherService;
    })
    .inSingletonScope();

  // 4) SimpleAgent - 标准构造函数注入（同步创建）
  container.bind<SimpleAgent>(TYPES.SimpleAgent)
    .to(SimpleAgent)
    .inSingletonScope();

  // 5) UIEventEmitter - 事件系统
  container.bind<UIEventEmitter>(TYPES.UIEventEmitter)
    .toDynamicValue(() => new UIEventEmitter())
    .inSingletonScope();

  // 6) ReActAgent - 标准构造函数注入
  container.bind<ReActAgent>(TYPES.ReActAgent)
    .to(ReActAgent)
    .inSingletonScope();

  // 6) SessionService - 标准构造函数注入
  container.bind<SessionService>(TYPES.SessionService)
    .to(SessionService)
    .inSingletonScope();

  // 7) 工厂函数 - 使用 toFactory（避免循环依赖）
  container.bind<IReActAgentFactory>(TYPES.ReActAgentFactory)
    .toFactory(() => {
      return async (agent: SimpleAgent) => {
        return container.get<ReActAgent>(TYPES.ReActAgent);
      };
    });

  container.bind<ISnapshotManagerFactory>(TYPES.SnapshotManagerFactory)
    .toFactory(() => {
      return async (projectRoot?: string) => {
        const { SnapshotManager } = await import('../services/SnapshotManager.js');
        return new SnapshotManager(projectRoot || process.cwd());
      };
    });

  // 8) 异步初始化的服务（用于需要完全初始化的实例）
  container.bind<() => Promise<SimpleAgent>>(TYPES.InitializedSimpleAgent)
    .toFactory(() => {
      return async () => {
        const agent = container.get<SimpleAgent>(TYPES.SimpleAgent);
        const config = container.get<Config>(TYPES.Config);

        console.log('✅ Agent已创建，开始异步初始化...');
        await agent.initializeAsync(config.customContext);
        console.log('✅ Agent异步初始化完成');

        const initStatus = agent.getInitializationStatus();
        if (!initStatus.allLoaded) {
          console.warn('⚠️ Agent初始化不完整，某些功能可能受限');
          if (initStatus.error) {
            console.warn(`⚠️ 初始化错误: ${initStatus.error}`);
          }
        } else {
          console.log(`✅ 所有工具已加载完成 (${initStatus.toolCount}个工具)`);
        }

        return agent;
      };
    });

  container.bind<() => Promise<SessionService>>(TYPES.InitializedSessionService)
    .toFactory(() => {
      return async () => {
        // 获取完全初始化的SimpleAgent
        const agentFactory = container.get<() => Promise<SimpleAgent>>(TYPES.InitializedSimpleAgent);
        const agent = await agentFactory();

        // 然后获取SessionService并手动设置依赖
        const sessionService = container.get<SessionService>(TYPES.SessionService);
        console.log('✅ 会话管理服务已初始化');
        return sessionService;
      };
    });

  console.log('🏗️ 依赖注入容器已配置完成');
  return container;
}

/**
 * 全局容器实例（延迟初始化）
 */
let _container: Container | null = null;

/**
 * 获取全局容器实例
 * @returns Container实例
 */
export function getContainer(): Container {
  if (!_container) {
    _container = createContainer();
  }
  return _container;
}

/**
 * 清理和重置容器（主要用于测试）
 */
export function resetContainer(): void {
  if (_container) {
    _container.unbindAll();
    _container = null;
  }
}
