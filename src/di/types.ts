/**
 * 依赖注入服务标识符
 * 使用Symbol确保唯一性
 */
export const TYPES = {
  // 核心配置和模型
  Config: Symbol.for('Config'),
  ConfigLoader: Symbol.for('ConfigLoader'),
  LanguageModel: Symbol.for('LanguageModel'),
  ModelFactory: Symbol.for('ModelFactory'),

  // 核心服务
  SimpleAgent: Symbol.for('SimpleAgent'),
  SessionService: Symbol.for('SessionService'),
  FileWatcherService: Symbol.for('FileWatcherService'),
  ReActAgent: Symbol.for('ReActAgent'),

  // 快照管理 (替代Git工作流管理)
  SnapshotManager: Symbol.for('SnapshotManager'),

  // 事件系统
  UIEventEmitter: Symbol.for('UIEventEmitter'),

  // CLI和UI组件
  TempuraiCLI: Symbol.for('TempuraiCLI'),
  InkUIApp: Symbol.for('InkUIApp'),

  // 异步初始化的服务
  InitializedSimpleAgent: Symbol.for('InitializedSimpleAgent'),
  InitializedSessionService: Symbol.for('InitializedSessionService'),

  // 工厂函数
  ReActAgentFactory: Symbol.for('ReActAgentFactory'),
  SnapshotManagerFactory: Symbol.for('SnapshotManagerFactory'),
};