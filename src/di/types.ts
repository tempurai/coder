export const TYPES = {
  // --- Core Configuration ---
  Config: Symbol.for('Config'),
  ConfigLoader: Symbol.for('ConfigLoader'),
  LanguageModel: Symbol.for('LanguageModel'),
  ModelFactory: Symbol.for('ModelFactory'),

  // --- Core Agents ---
  ToolAgent: Symbol.for('ToolAgent'),
  SmartAgent: Symbol.for('SmartAgent'),
  AgentOrchestrator: Symbol.for('AgentOrchestrator'),
  TodoManager: Symbol.for('TodoManager'),
  SubAgent: Symbol.for('SubAgent'),
  CompressedAgent: Symbol.for('CompressedAgent'),

  // --- Core Services ---
  SessionService: Symbol.for('SessionService'),

  // --- Supporting Services ---
  FileWatcherService: Symbol.for('FileWatcherService'),
  UIEventEmitter: Symbol.for('UIEventEmitter'),
  HITLManager: Symbol.for('HITLManager'),
  InterruptService: Symbol.for('InterruptService'),
  Logger: Symbol.for('Logger'),

  SecurityPolicyEngine: Symbol.for('SecurityPolicyEngine'),
  ToolRegistry: Symbol.for('ToolRegistry'),

  // --- Factories for Async/On-demand Initialization ---
  InitializedToolAgent: Symbol.for('InitializedToolAgent'),
  InitializedSmartAgent: Symbol.for('InitializedSmartAgent'),
  InitializedSessionService: Symbol.for('InitializedSessionService'),
  SnapshotManagerFactory: Symbol.for('SnapshotManagerFactory'),
};