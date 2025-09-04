import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { SystemInfoEvent } from '../events/EventTypes.js';

export class IndentLogger {
    private static eventEmitter?: UIEventEmitter;

    static setEventEmitter(eventEmitter?: UIEventEmitter): void {
        this.eventEmitter = eventEmitter;
    }

    static log(message: string, indent = 0): void {
        const formattedMessage = indent === 0 ? message : `→ ${message}`;
        console.log(formattedMessage);
    }

    static logAndSendEvent(message: string, indent = 0): void {
        const formattedMessage = indent === 0 ? message : `→ ${message}`;
        console.log(formattedMessage);
        if (this.eventEmitter) {
            this.eventEmitter.emit({
                type: 'system_info',
                level: 'info',
                message: formattedMessage,
                source: 'system'
            } as SystemInfoEvent);
        }
    }
}