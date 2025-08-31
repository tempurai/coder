import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { ToolConfirmationRequestEvent, ToolConfirmationResponseEvent } from '../events/EventTypes.js';

interface PendingConfirmation {
    resolve: (approved: boolean) => void;
    reject: (error: Error) => void;
}

@injectable()
export class HITLManager {
    private pendingConfirmations = new Map<string, PendingConfirmation>();

    constructor(
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter
    ) {
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.eventEmitter.on('tool_confirmation_response', (event: ToolConfirmationResponseEvent) => {
            this.handleConfirmationResponse(event);
        });
    }

    async requestConfirmation(toolName: string, args: any, description: string): Promise<boolean> {
        const confirmationId = this.generateConfirmationId();

        const confirmationPromise = new Promise<boolean>((resolve, reject) => {
            this.pendingConfirmations.set(confirmationId, { resolve, reject });
        });

        // 发送确认请求事件
        this.eventEmitter.emit({
            type: 'tool_confirmation_request',
            confirmationId,
            toolName,
            args,
            description,
        } as Omit<ToolConfirmationRequestEvent, 'id' | 'timestamp' | 'sessionId'>);

        return confirmationPromise;
    }

    private handleConfirmationResponse(event: ToolConfirmationResponseEvent): void {
        const pending = this.pendingConfirmations.get(event.confirmationId);
        if (!pending) {
            console.warn(`Received response for unknown confirmation ID: ${event.confirmationId}`);
            return;
        }

        this.pendingConfirmations.delete(event.confirmationId);
        pending.resolve(event.approved);
    }

    private generateConfirmationId(): string {
        return `conf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}