import { EventEmitter } from 'events';
import { injectable } from 'inversify';
import {
  UIEvent,
  UIEventType,
  EventListener,
  EventSubscription,
} from './EventTypes.js';

@injectable()
export class UIEventEmitter {
  private emitter = new EventEmitter();
  private sessionId: string;
  private eventCounter = 0;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.emitter.setMaxListeners(50);
  }

  emit(event: Omit<UIEvent, 'id' | 'timestamp' | 'sessionId'>): void {
    const fullEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date(),
      sessionId: this.sessionId,
    } as UIEvent;

    this.emitter.emit(event.type, fullEvent);
    this.emitter.emit('*', fullEvent);
  }

  on<T extends UIEvent>(eventType: T['type'], listener: EventListener<T>): EventSubscription {
    this.emitter.on(eventType, listener);
    return {
      unsubscribe: () => this.emitter.removeListener(eventType, listener),
    };
  }

  onAll(listener: EventListener<UIEvent>): EventSubscription {
    this.emitter.on('*', listener);
    return {
      unsubscribe: () => this.emitter.removeListener('*', listener),
    };
  }

  once<T extends UIEvent>(eventType: T['type'], listener: EventListener<T>): EventSubscription {
    this.emitter.once(eventType, listener);
    return {
      unsubscribe: () => this.emitter.removeListener(eventType, listener),
    };
  }

  clear(): void {
    this.emitter.removeAllListeners();
  }

  getListenerCount(eventType?: UIEventType): number {
    if (eventType) {
      return this.emitter.listenerCount(eventType);
    }
    return this.emitter.eventNames().reduce((sum, name) => sum + this.emitter.listenerCount(name), 0);
  }

  private generateEventId(): string {
    return `${this.sessionId}_${++this.eventCounter}_${Date.now()}`;
  }

  getSessionId(): string {
    return this.sessionId;
  }

}