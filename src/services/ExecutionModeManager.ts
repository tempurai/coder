import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { SystemInfoEvent } from '../events/EventTypes.js';

export enum ExecutionMode {
    CODE = 'code',
    PLAN = 'plan'
}

export interface ExecutionModeInfo {
    mode: ExecutionMode;
    displayName: string;
    description: string;
    icon: string;
}

@injectable()
export class ExecutionModeManager {
    private currentMode: ExecutionMode = ExecutionMode.CODE;

    constructor(
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter
    ) { }

    getCurrentMode(): ExecutionMode {
        return this.currentMode;
    }

    setMode(mode: ExecutionMode): void {
        const oldMode = this.currentMode;
        this.currentMode = mode;

        if (oldMode !== mode) {
            this.eventEmitter.emit({
                type: 'system_info',
                level: 'info',
                message: `Execution mode changed: ${this.getModeInfo(oldMode).displayName} → ${this.getModeInfo(mode).displayName}`,
                context: { oldMode, newMode: mode }
            } as SystemInfoEvent);
        }
    }

    cycleMode(): ExecutionMode {
        const newMode = this.currentMode === ExecutionMode.CODE ? ExecutionMode.PLAN : ExecutionMode.CODE;
        this.setMode(newMode);
        return newMode;
    }

    getModeInfo(mode?: ExecutionMode): ExecutionModeInfo {
        const targetMode = mode || this.currentMode;

        if (targetMode === ExecutionMode.PLAN) {
            return {
                mode: ExecutionMode.PLAN,
                displayName: 'Plan Mode',
                description: 'Research and analyze, no file modifications',
                icon: '📋'
            };
        }

        return {
            mode: ExecutionMode.CODE,
            displayName: 'Code Mode',
            description: 'Full development capabilities with file modifications',
            icon: '⚡'
        };
    }

    getStatusMessage(): string {
        const modeInfo = this.getModeInfo();
        return `${modeInfo.icon} ${modeInfo.displayName}`;
    }

    reset(): void {
        this.currentMode = ExecutionMode.CODE;
    }
}