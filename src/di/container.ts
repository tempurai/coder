import 'reflect-metadata';
import { Container } from 'inversify';
import { Config, ConfigLoader } from '../config/ConfigLoader';
import { SimpleAgent } from '../agents/SimpleAgent';
import { SessionService, SessionServiceDependencies } from '../session/SessionService';
import { FileWatcherService } from '../services/FileWatcherService';

/**
 * 依赖注入服务标识符
 * 使用Symbol确保唯一性
 */
export const TYPES = {
  // 核心配置和模型
  Config: Symbol.for('Config'),
  ConfigLoader: Symbol.for('ConfigLoader'),
  LanguageModel: Symbol.for('LanguageModel'),

  // 核心服务
  SimpleAgent: Symbol.for('SimpleAgent'),
  SessionService: Symbol.for('SessionService'),
  FileWatcherService: Symbol.for('FileWatcherService'),

  // 工具和管理器
  GitWorkflowManager: Symbol.for('GitWorkflowManager'),
  ReActAgent: Symbol.for('ReActAgent'),

  // CLI和UI组件
  TempuraiCLI: Symbol.for('TempuraiCLI'),
  InkUIApp: Symbol.for('InkUIApp'),

  // 工厂函数
  ReActAgentFactory: Symbol.for('ReActAgentFactory'),
  GitWorkflowManagerFactory: Symbol.for('GitWorkflowManagerFactory'),
};

/**
 * 工厂函数类型定义
 */
export type ReActAgentFactory = (agent: any) => any;
export type GitWorkflowManagerFactory = () => any;

/**
 * 创建和配置依赖注入容器
 * @returns 配置好的Container实例
 */
export function createContainer(): Container {
  const container = new Container();

  // 1) 配置相关 - 单例
  container.bind<ConfigLoader>(TYPES.ConfigLoader)
    .to(ConfigLoader)
    .inSingletonScope();

  container.bind<Config>(TYPES.Config)
    .toDynamicValue(() => {
      const configLoader = container.get<ConfigLoader>(TYPES.ConfigLoader);
      return configLoader.getConfig();
    })
    .inSingletonScope();

  // 2) 语言模型 - 单例，异步初始化 -> 绑定 Promise<any>
  container.bind<Promise<any>>(TYPES.LanguageModel)
    .toDynamicValue(async () => {
      const configLoader = container.get<ConfigLoader>(TYPES.ConfigLoader);
      console.log('🔄 正在初始化AI模型...');
      const model = await configLoader.createLanguageModel();
      console.log(`✅ 模型已初始化: ${configLoader.getModelDisplayName()}`);
      return model;
    })
    .inSingletonScope();

  // 3) 文件监听服务 - 单例
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

  // 4) SimpleAgent - 单例，异步初始化 -> 绑定 Promise<SimpleAgent>
  container.bind<Promise<SimpleAgent>>(TYPES.SimpleAgent)
    .toDynamicValue(async () => {
      const config = container.get<Config>(TYPES.Config);
      const model = await container.get<Promise<any>>(TYPES.LanguageModel);

      console.log('✅ Agent已创建，开始异步初始化...');
      const agent = new SimpleAgent(config, model, config.customContext);

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
    })
    .inSingletonScope();

  // 5) 工厂函数 - 使用 toFactory（避免循环依赖），不引用 interfaces
  container.bind<ReActAgentFactory>(TYPES.ReActAgentFactory)
    .toFactory(() => {
      return (agent: SimpleAgent) => {
        // 延迟导入避免循环依赖
        const { ReActAgent } = require('../agents/ReActAgent');
        return new ReActAgent(agent);
      };
    });

  container.bind<GitWorkflowManagerFactory>(TYPES.GitWorkflowManagerFactory)
    .toFactory(() => {
      return () => {
        // 延迟导入避免循环依赖
        const { GitWorkflowManager } = require('../tools/GitWorkflowManager');
        return new GitWorkflowManager();
      };
    });


  // 6) SessionService - 单例，异步初始化 -> 绑定 Promise<SessionService>
  container.bind<Promise<SessionService>>(TYPES.SessionService)
    .toDynamicValue(async () => {
      const agent = await container.get<Promise<SimpleAgent>>(TYPES.SimpleAgent);
      const fileWatcher = container.get<FileWatcherService>(TYPES.FileWatcherService);
      const config = container.get<Config>(TYPES.Config);
      const createReActAgent = container.get<ReActAgentFactory>(TYPES.ReActAgentFactory);
      const createGitWorkflowManager = container.get<GitWorkflowManagerFactory>(TYPES.GitWorkflowManagerFactory);

      const dependencies: SessionServiceDependencies = {
        agent,
        fileWatcher,
        config,
        createReActAgent,
        createGitWorkflowManager,
      };

      const sessionService = new SessionService(dependencies);
      console.log('✅ 会话管理服务已初始化');
      return sessionService;
    })
    .inSingletonScope();

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
