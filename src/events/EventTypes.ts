/**
 * Comprehensive event system for Tempurai UI
 * Provides fine-grained events for real-time UI updates
 */

export interface BaseEvent {
  id: string;
  timestamp: Date;
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

export interface SnapshotCreatedEvent extends BaseEvent {
  type: 'snapshot_created';
  snapshotId: string;
  description: string;
  filesCount: number;
}

export interface ReActIterationStartedEvent extends BaseEvent {
  type: 'react_iteration_started';
  iteration: number;
  maxIterations: number;
  observation: string;
}

export interface ThoughtGeneratedEvent extends BaseEvent {
  type: 'thought_generated';
  iteration: number;
  thought: string;
  context: string;
}

export interface PlanUpdatedEvent extends BaseEvent {
  type: 'plan_updated';
  iteration: number;
  plan: string;
  status: string;
}

export interface ActionSelectedEvent extends BaseEvent {
  type: 'action_selected';
  iteration: number;
  tool: string;
  args: any;
  reasoning: string;
}

export interface ToolCallStartedEvent extends BaseEvent {
  type: 'tool_call_started';
  iteration: number;
  toolName: string;
  args: any;
  description?: string;
}

export interface ToolProgressEvent extends BaseEvent {
  type: 'tool_progress';
  iteration: number;
  toolName: string;
  phase: string;
  message: string;
  progress?: number;
  details?: any;
}

export interface ToolCallCompletedEvent extends BaseEvent {
  type: 'tool_call_completed';
  iteration: number;
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
}

export interface ObservationMadeEvent extends BaseEvent {
  type: 'observation_made';
  iteration: number;
  observation: string;
  analysis?: string;
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

export type UIEvent =
  | TaskStartedEvent
  | TaskCompletedEvent
  | SnapshotCreatedEvent
  | ReActIterationStartedEvent
  | ThoughtGeneratedEvent
  | PlanUpdatedEvent
  | ActionSelectedEvent
  | ToolCallStartedEvent
  | ToolProgressEvent
  | ToolCallCompletedEvent
  | ObservationMadeEvent
  | SystemInfoEvent
  | UserInputEvent
  | SessionStatsEvent;

export type UIEventType = UIEvent['type'];

// UIEventType enum for easy reference
export const UIEventType = {
  TaskStart: 'task_started' as const,
  TaskComplete: 'task_completed' as const,
  SnapshotCreated: 'snapshot_created' as const,
  ReActIteration: 'react_iteration_started' as const,
  SystemInfo: 'system_info' as const,
  UserInput: 'user_input' as const,
  ThoughtGenerated: 'thought_generated' as const,
  PlanUpdated: 'plan_updated' as const,
  ActionSelected: 'action_selected' as const,
  ToolCallStarted: 'tool_call_started' as const,
  ToolProgress: 'tool_progress' as const,
  ToolCallCompleted: 'tool_call_completed' as const,
  ObservationMade: 'observation_made' as const,
  SessionStats: 'session_stats' as const,
} as const;

export type ProgressCallback = (event: ToolProgressEvent) => void;

export interface EventListener<T extends UIEvent = UIEvent> {
  (event: T): void | Promise<void>;
}

export interface EventSubscription {
  unsubscribe(): void;
}