import { ConfirmationChoice } from '../services/HITLManager.js';

export interface BaseEvent {
  id?: string;
  timestamp?: Date;
  sessionId?: string;
  subEvents?: UIEvent[];
}

export interface TaskStartedEvent extends BaseEvent {
  type: 'task_started';
  description: string;
  workingDirectory: string;
  displayTitle: string;
}

export interface TaskCompletedEvent extends BaseEvent {
  type: 'task_completed';
  displayTitle: string;
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
}

export interface ToolExecutionStartedEvent extends BaseEvent {
  type: 'tool_execution_started';
  toolName: string;
  iteration?: number;
  toolExecutionId: string;
  displayTitle: string;
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
  displayDetails?: string;
}

export interface ToolExecutionOutputEvent extends BaseEvent {
  type: 'tool_execution_output';
  toolExecutionId: string;
  content: string;
  phase?: string;
}

export interface SystemInfoEvent extends BaseEvent {
  type: 'system_info';
  level: 'info' | 'warning' | 'error';
  message: string;
  context?: any;
  source?: 'tool' | 'system' | 'agent';
  sourceId?: string;
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

// 简单的Todo事件
export interface TodoStartEvent extends BaseEvent {
  type: 'todo_start';
  todoId: string;
  title: string;
}

export interface TodoEndEvent extends BaseEvent {
  type: 'todo_end';
  todoId: string;
}

export interface ToolConfirmationRequestEvent extends BaseEvent {
  type: 'tool_confirmation_request';
  confirmationId: string;
  toolName: string;
  args: any;
  description: string;
  options?: {
    showRememberOption?: boolean;
    defaultChoice?: ConfirmationChoice;
    timeout?: number;
  };
}

export interface ToolConfirmationResponseEvent extends BaseEvent {
  type: 'tool_confirmation_response';
  confirmationId: string;
  approved: boolean;
  choice?: ConfirmationChoice;
}

export type UIEvent =
  | TextGeneratedEvent
  | TaskStartedEvent
  | TaskCompletedEvent
  | SnapshotCreatedEvent
  | ThoughtGeneratedEvent
  | ToolExecutionStartedEvent
  | ToolExecutionCompletedEvent
  | ToolExecutionOutputEvent
  | SystemInfoEvent
  | UserInputEvent
  | SessionStatsEvent
  | TodoStartEvent
  | TodoEndEvent
  | ToolConfirmationRequestEvent
  | ToolConfirmationResponseEvent

export type UIEventType = UIEvent['type'];

export const UIEventType = {
  TaskStart: 'task_started' as const,
  TaskComplete: 'task_completed' as const,
  ThoughtGenerated: 'thought_generated' as const,
  TextGenerated: 'text_generated' as const,
  ToolExecutionStarted: 'tool_execution_started' as const,
  ToolExecutionCompleted: 'tool_execution_completed' as const,
  ToolExecutionOutput: 'tool_execution_output' as const,
  SystemInfo: 'system_info' as const,
  UserInput: 'user_input' as const,
  SessionStats: 'session_stats' as const,
  SnapshotCreated: 'snapshot_created' as const,
  TodoStart: 'todo_start' as const,
  TodoEnd: 'todo_end' as const,
  ToolConfirmationRequest: 'tool_confirmation_request' as const,
  ToolConfirmationResponse: 'tool_confirmation_response' as const,
} as const;

export interface EventListener<T extends UIEvent = UIEvent> {
  (event: T): void | Promise<void>;
}

export interface EventSubscription {
  unsubscribe(): void;
}