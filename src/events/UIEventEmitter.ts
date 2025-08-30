import { EventEmitter } from 'events';
import { UIEvent, UIEventType, EventListener, EventSubscription, ProgressCallback, ToolProgressEvent } from './EventTypes.js';

/**
 * Specialized event emitter for Tempurai UI events
 * Provides type-safe event handling with automatic cleanup
 */
export class UIEventEmitter {
  private emitter = new EventEmitter();
  private sessionId: string;
  private eventCounter = 0;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.emitter.setMaxListeners(50); // Increase for multiple subscribers
  }

  /**
   * Emit a UI event with automatic ID generation
   */
  emit<T extends UIEvent>(event: Omit<T, 'id' | 'timestamp' | 'sessionId'>): void {
    const fullEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date(),
      sessionId: this.sessionId,
    } as T;

    this.emitter.emit(event.type, fullEvent);
    this.emitter.emit('*', fullEvent); // Wildcard listener
  }

  /**
   * Subscribe to specific event type
   */
  on<T extends UIEvent>(eventType: T['type'], listener: EventListener<T>): EventSubscription {
    this.emitter.on(eventType, listener);
    return {
      unsubscribe: () => this.emitter.removeListener(eventType, listener),
    };
  }

  /**
   * Subscribe to all events
   */
  onAll(listener: EventListener<UIEvent>): EventSubscription {
    this.emitter.on('*', listener);
    return {
      unsubscribe: () => this.emitter.removeListener('*', listener),
    };
  }

  /**
   * Subscribe to event once
   */
  once<T extends UIEvent>(eventType: T['type'], listener: EventListener<T>): EventSubscription {
    this.emitter.once(eventType, listener);
    return {
      unsubscribe: () => this.emitter.removeListener(eventType, listener),
    };
  }

  /**
   * Create a progress callback for tool execution
   */
  createProgressCallback(iteration: number, toolName: string): ProgressCallback {
    return (event) => {
      this.emit<ToolProgressEvent>({
        type: 'tool_progress',
        iteration,
        toolName,
        phase: event.phase,
        message: event.message,
        progress: event.progress,
        details: event.details,
      });
    };
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.emitter.removeAllListeners();
  }

  /**
   * Get current listener count for debugging
   */
  getListenerCount(eventType?: UIEventType): number {
    if (eventType) {
      return this.emitter.listenerCount(eventType);
    }
    return this.emitter.eventNames().reduce((sum, name) => sum + this.emitter.listenerCount(name), 0);
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `${this.sessionId}_${++this.eventCounter}_${Date.now()}`;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}