export const TYPES = {
  // --- Core Configuration ---
  Config: Symbol.for('Config'),
  ConfigLoader: Symbol.for('ConfigLoader'),
  LanguageModel: Symbol.for('LanguageModel'),
  ModelFactory: Symbol.for('ModelFactory'),

  // --- Core Agents & Services ---
  ToolAgent: Symbol.for('ToolAgent'),
  SessionService: Symbol.for('SessionService'),

  // --- Supporting Services ---
  FileWatcherService: Symbol.for('FileWatcherService'),
  UIEventEmitter: Symbol.for('UIEventEmitter'),

  // --- Factories for Async/On-demand Initialization ---
  InitializedToolAgent: Symbol.for('InitializedToolAgent'),
  InitializedSessionService: Symbol.for('InitializedSessionService'),
  SnapshotManagerFactory: Symbol.for('SnapshotManagerFactory'),
};