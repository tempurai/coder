export const TYPES = {
  // --- Core Configuration ---
  Config: Symbol.for('Config'),
  ConfigLoader: Symbol.for('ConfigLoader'),
  LanguageModel: Symbol.for('LanguageModel'),
  ModelFactory: Symbol.for('ModelFactory'),

  // --- Core Agents ---
  SmartAgent: Symbol.for('SmartAgent'),
  AgentOrchestrator: Symbol.for('AgentOrchestrator'),
  TodoManager: Symbol.for('TodoManager'),
  SubAgent: Symbol.for('SubAgent'),
  CompressedAgent: Symbol.for('CompressedAgent'),

  // --- Global Services (Singleton) ---
  FileWatcherService: Symbol.for('FileWatcherService'),
  UIEventEmitter: Symbol.for('UIEventEmitter'),
  Logger: Symbol.for('Logger'),
  SecurityPolicyEngine: Symbol.for('SecurityPolicyEngine'),
  ToolRegistry: Symbol.for('ToolRegistry'),

  // --- Session-scoped Services (Request scope for optimization) ---
  InterruptService: Symbol.for('InterruptService'),
  EditModeManager: Symbol.for('EditModeManager'),
  HITLManager: Symbol.for('HITLManager'),
  CompressorService: Symbol.for('CompressorService'),

  // --- Per-Task Services (Transient) ---
  ToolAgent: Symbol.for('ToolAgent'),
  ToolInterceptor: Symbol.for('ToolInterceptor'),

  // --- Factories ---
  SessionServiceFactory: Symbol.for('SessionServiceFactory'),
};