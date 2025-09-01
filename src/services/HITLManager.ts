import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { ToolConfirmationRequestEvent, ToolConfirmationResponseEvent } from '../events/EventTypes.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { ToolNames } from '../tools/ToolRegistry.js';

export type ConfirmationChoice = 'yes' | 'no' | 'yes_and_remember';

export interface ConfirmationOptions {
    showRememberOption?: boolean;
    defaultChoice?: ConfirmationChoice;
    timeout?: number;
}

interface PendingConfirmation {
    resolve: (choice: ConfirmationChoice) => void;
    reject: (error: Error) => void;
    options: ConfirmationOptions;
}

@injectable()
export class HITLManager {
    private pendingConfirmations = new Map<string, PendingConfirmation>();

    constructor(
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
        @inject(TYPES.ConfigLoader) private configLoader: ConfigLoader
    ) {
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.eventEmitter.on('tool_confirmation_response', (event: ToolConfirmationResponseEvent) => {
            this.handleConfirmationResponse(event);
        });
    }

    async requestConfirmation(
        toolName: string,
        args: any,
        description: string,
        options: ConfirmationOptions = {}
    ): Promise<boolean> {
        const choice = await this.requestConfirmationWithChoice(toolName, args, description, options);
        if (choice === 'yes_and_remember') {
            await this.addToAllowlist(toolName, args);
            return true;
        }
        return choice === 'yes';
    }

    async requestConfirmationWithChoice(
        toolName: string,
        args: any,
        description: string,
        options: ConfirmationOptions = {}
    ): Promise<ConfirmationChoice> {
        const confirmationId = this.generateConfirmationId();

        const confirmationPromise = new Promise<ConfirmationChoice>((resolve, reject) => {
            this.pendingConfirmations.set(confirmationId, {
                resolve,
                reject,
                options
            });

            if (options.timeout && options.timeout > 0) {
                setTimeout(() => {
                    const pending = this.pendingConfirmations.get(confirmationId);
                    if (pending) {
                        this.pendingConfirmations.delete(confirmationId);
                        resolve(options.defaultChoice || 'no');
                    }
                }, options.timeout);
            }
        });

        this.eventEmitter.emit({
            type: 'tool_confirmation_request',
            confirmationId,
            toolName,
            args,
            description,
            options
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

        if ('choice' in event && event.choice) {
            pending.resolve(event.choice as ConfirmationChoice);
        } else {
            pending.resolve(event.approved ? 'yes' : 'no');
        }
    }

    private async addToAllowlist(toolName: string, args: any): Promise<void> {
        try {
            if (toolName === ToolNames.SHELL_EXECUTOR && args.command) {
                const command = this.extractCommandName(args.command);
                if (command) {
                    const config = this.configLoader.getConfig();
                    const currentAllowlist = config.tools.shellExecutor.security.allowlist;

                    if (!currentAllowlist.includes(command)) {
                        const updatedConfig = {
                            tools: {
                                ...config.tools,
                                shellExecutor: {
                                    ...config.tools.shellExecutor,
                                    security: {
                                        ...config.tools.shellExecutor.security,
                                        allowlist: [...currentAllowlist, command]
                                    }
                                }
                            }
                        };

                        await this.configLoader.updateConfig(updatedConfig, true);
                        console.log(`Added '${command}' to allowlist`);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to add command to allowlist:', error);
        }
    }

    private extractCommandName(commandLine: string): string | null {
        if (!commandLine || typeof commandLine !== 'string') {
            return null;
        }

        const parts = commandLine.trim().split(/\s+/);
        if (parts.length === 0) return null;

        const firstPart = parts[0];
        const pathSegments = firstPart.split(/[/\\]/);
        const commandName = pathSegments[pathSegments.length - 1];
        return commandName.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
    }

    private generateConfirmationId(): string {
        return `conf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}