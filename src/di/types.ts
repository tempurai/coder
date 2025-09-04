export const TYPES = {
  // Config
  Config: Symbol.for('Config'),
  ConfigLoader: Symbol.for('ConfigLoader'),
  LanguageModel: Symbol.for('LanguageModel'),
  ModelFactory: Symbol.for('ModelFactory'),

  // Agents
  SmartAgent: Symbol.for('SmartAgent'),
  AgentOrchestrator: Symbol.for('AgentOrchestrator'),
  TodoManager: Symbol.for('TodoManager'),
  SubAgent: Symbol.for('SubAgent'),
  CompressedAgent: Symbol.for('CompressedAgent'),

  // Services
  FileWatcherService: Symbol.for('FileWatcherService'),
  UIEventEmitter: Symbol.for('UIEventEmitter'),
  Logger: Symbol.for('Logger'),
  SecurityPolicyEngine: Symbol.for('SecurityPolicyEngine'),
  ToolRegistry: Symbol.for('ToolRegistry'),

  // Request-scoped services
  InterruptService: Symbol.for('InterruptService'),
  EditModeManager: Symbol.for('EditModeManager'),
  HITLManager: Symbol.for('HITLManager'),
  CompressorService: Symbol.for('CompressorService'),

  // Tool services
  ToolAgent: Symbol.for('ToolAgent'),
  ToolInterceptor: Symbol.for('ToolInterceptor'),

  // Indexing
  ProjectIndexer: Symbol.for('ProjectIndexer'),

  // Factories
  SessionServiceFactory: Symbol.for('SessionServiceFactory'),
};