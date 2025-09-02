import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import { SystemInfoEvent } from '../events/EventTypes.js';

export enum EditMode {
    NORMAL = 'normal',
    ALWAYS_ACCEPT = 'accept'
}

export interface EditModeInfo {
    mode: EditMode;
    displayName: string;
    description: string;
    icon: string;
    shortcut: string;
}

export interface EditPermissionResult {
    allowed: boolean;
    reason?: string;
    needsConfirmation?: boolean;
}

@injectable()
export class EditModeManager {
    private currentMode: EditMode = EditMode.NORMAL;
    private sessionEditApprovals = new Set<string>();

    constructor(
        @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter
    ) { }

    getCurrentMode(): EditMode {
        return this.currentMode;
    }

    setMode(mode: EditMode): void {
        const oldMode = this.currentMode;
        this.currentMode = mode;
        if (oldMode !== mode) {
            this.eventEmitter.emit({
                type: 'system_info',
                level: 'info',
                message: `Edit mode changed: ${this.getModeInfo(oldMode).displayName} → ${this.getModeInfo(mode).displayName}`,
                context: { oldMode, newMode: mode }
            } as SystemInfoEvent);
        }
    }

    cycleMode(): EditMode {
        const nextMode = this.currentMode === EditMode.NORMAL ? EditMode.ALWAYS_ACCEPT : EditMode.NORMAL;
        this.setMode(nextMode);
        return nextMode;
    }

    getModeInfo(mode?: EditMode): EditModeInfo {
        const targetMode = mode || this.currentMode;

        if (targetMode === EditMode.ALWAYS_ACCEPT) {
            return {
                mode: EditMode.ALWAYS_ACCEPT,
                displayName: 'Always Accept',
                description: 'Automatically allow all file edits',
                icon: '>>',
                shortcut: 'Shift+Tab'
            };
        }

        return {
            mode: EditMode.NORMAL,
            displayName: 'Normal',
            description: 'Ask for confirmation on each file edit',
            icon: '?',
            shortcut: 'Shift+Tab'
        };
    }

    checkEditPermission(toolName: string, args: any): EditPermissionResult {
        if (this.currentMode === EditMode.ALWAYS_ACCEPT) {
            return { allowed: true };
        }

        const operationKey = this.generateOperationKey(toolName, args);
        if (this.sessionEditApprovals.has(operationKey)) {
            return { allowed: true };
        }

        return {
            allowed: false,
            needsConfirmation: true
        };
    }

    rememberEditApproval(toolName: string, args: any): void {
        const operationKey = this.generateOperationKey(toolName, args);
        this.sessionEditApprovals.add(operationKey);
    }

    private generateOperationKey(toolName: string, args: any): string {
        if (toolName === 'write_file' || toolName === 'create_file' || toolName === 'apply_patch') {
            return `${toolName}:${args.filePath || 'unknown'}`;
        }
        if (toolName === 'shell_executor' && args.command) {
            return `shell_write:${args.command}`;
        }
        return `${toolName}:general`;
    }

    getStatusMessage(): string {
        const modeInfo = this.getModeInfo();
        if (this.currentMode === EditMode.NORMAL) {
            const approvalCount = this.sessionEditApprovals.size;
            return approvalCount > 0
                ? `${modeInfo.icon} Normal mode • ${approvalCount} edit(s) remembered`
                : `${modeInfo.icon} Normal mode`;
        }
        return `${modeInfo.icon} Always accept edits`;
    }

    clearSessionApprovals(): void {
        this.sessionEditApprovals.clear();
        this.eventEmitter.emit({
            type: 'system_info',
            level: 'info',
            message: 'Session edit approvals cleared',
        } as SystemInfoEvent);
    }

    getApprovalCount(): number {
        return this.sessionEditApprovals.size;
    }

    reset(): void {
        this.currentMode = EditMode.NORMAL;
        this.sessionEditApprovals.clear();
    }
}