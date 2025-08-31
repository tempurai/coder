export interface BaseEvent {
  id: string;
  timestamp: Date;
  sessionId?: string;
}

// Task level events
export interface TaskStartedEvent extends BaseEvent {
  type: 'task_started';
  description: string;
  workingDirectory: string;
}

export interface TaskCompletedEvent extends BaseEvent {
  type: 'task_completed';
  success: boolean;
  duration: number;
  iterations: number;
  summary: string;
  error?: string;
}

export interface TextGeneratedEvent extends BaseEvent {
  type: 'text_generated';
  text: string;
}

export interface ThoughtGeneratedEvent extends BaseEvent {
  type: 'thought_generated';
  iteration: number;
  thought: string;
  context: string;
}

export interface ToolExecutionStartedEvent extends BaseEvent {
  type: 'tool_execution_started';
  toolName: string;
  args: any;
  iteration?: number;
}

export interface ToolExecutionCompletedEvent extends BaseEvent {
  type: 'tool_execution_completed';
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
  iteration?: number;
}

export interface ToolOutputEvent extends BaseEvent {
  type: 'tool_output';
  toolName: string;
  content: string;
  iteration?: number;
}

// System and user events
export interface SystemInfoEvent extends BaseEvent {
  type: 'system_info';
  level: 'info' | 'warning' | 'error';
  message: string;
  context?: any;
}

export interface UserInputEvent extends BaseEvent {
  type: 'user_input';
  input: string;
  command?: string;
}

// Session management events
export interface SessionStatsEvent extends BaseEvent {
  type: 'session_stats';
  stats: {
    totalInteractions: number;
    totalTokensUsed: number;
    averageResponseTime: number;
    uniqueFilesAccessed: number;
    sessionDuration: number;
  };
}

// Snapshot events
export interface SnapshotCreatedEvent extends BaseEvent {
  type: 'snapshot_created';
  snapshotId: string;
  description: string;
  filesCount: number;
}

// Union type of all events
export type UIEvent =
  | TextGeneratedEvent
  | TaskStartedEvent
  | TaskCompletedEvent
  | SnapshotCreatedEvent
  | ThoughtGeneratedEvent
  | ToolExecutionStartedEvent
  | ToolExecutionCompletedEvent
  | ToolOutputEvent
  | SystemInfoEvent
  | UserInputEvent
  | SessionStatsEvent


export type UIEventType = UIEvent['type'];

// Constants for event types
export const UIEventType = {
  // Core events
  TaskStart: 'task_started' as const,
  TaskComplete: 'task_completed' as const,
  ThoughtGenerated: 'thought_generated' as const,

  // Tool execution events
  ToolExecutionStarted: 'tool_execution_started' as const,
  ToolExecutionCompleted: 'tool_execution_completed' as const,
  ToolOutput: 'tool_output' as const,

  // System events
  SystemInfo: 'system_info' as const,
  UserInput: 'user_input' as const,
  SessionStats: 'session_stats' as const,
  SnapshotCreated: 'snapshot_created' as const,
} as const;


export interface EventListener<T extends UIEvent = UIEvent> {
  (event: T): void | Promise<void>;
}

export interface EventSubscription {
  unsubscribe(): void;
}