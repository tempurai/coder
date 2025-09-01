export interface BaseEvent {
  id?: string;
  timestamp?: Date;
  sessionId?: string;
}

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
  iteration?: number;
  toolExecutionId: string;
  displayTitle: string;
  displayStatus: string;
}

export interface ToolExecutionCompletedEvent extends BaseEvent {
  type: 'tool_execution_completed';
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
  iteration?: number;
  toolExecutionId: string;
  displayTitle: string;
  displaySummary: string;
  displayDetails?: string;
}

export interface ToolOutputEvent extends BaseEvent {
  type: 'tool_output';
  toolName: string;
  content: string;
  iteration?: number;
}

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

export interface SnapshotCreatedEvent extends BaseEvent {
  type: 'snapshot_created';
  snapshotId: string;
  description: string;
  filesCount: number;
}

export interface ToolConfirmationRequestEvent extends BaseEvent {
  type: 'tool_confirmation_request';
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
  options?: {
    showRememberOption?: boolean;
    defaultChoice?: 'yes' | 'no' | 'yes_and_remember';
    timeout?: number;
  };
}

export interface ToolConfirmationResponseEvent extends BaseEvent {
  type: 'tool_confirmation_response';
  confirmationId: string;
  approved: boolean;
  choice?: 'yes' | 'no' | 'yes_and_remember';
}

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
  | ToolConfirmationRequestEvent
  | ToolConfirmationResponseEvent

export type UIEventType = UIEvent['type'];

export const UIEventType = {
  TaskStart: 'task_started' as const,
  TaskComplete: 'task_completed' as const,
  ThoughtGenerated: 'thought_generated' as const,
  ToolExecutionStarted: 'tool_execution_started' as const,
  ToolExecutionCompleted: 'tool_execution_completed' as const,
  ToolOutput: 'tool_output' as const,
  SystemInfo: 'system_info' as const,
  UserInput: 'user_input' as const,
  SessionStats: 'session_stats' as const,
  SnapshotCreated: 'snapshot_created' as const,
  ToolConfirmationRequest: 'tool_confirmation_request' as const,
  ToolConfirmationResponse: 'tool_confirmation_response' as const,
  TextGenerated: 'text_generated' as const,
} as const;

export interface EventListener<T extends UIEvent = UIEvent> {
  (event: T): void | Promise<void>;
}

export interface EventSubscription {
  unsubscribe(): void;
}