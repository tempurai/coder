import { ToolAgent, Message, Messages, TaskExecutionResult, TerminateReason } from '../tool_agent/ToolAgent.js';
import { ToolRegistry, ToolNames } from '../../tools/ToolRegistry.js';
import { EditModeManager, EditMode } from '../../services/EditModeManager.js';
import { SecurityPolicyEngine } from '../../security/SecurityPolicyEngine.js';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../di/types.js';

@injectable()
export class ToolInterceptor {
    constructor(@inject(TYPES.ToolAgent) private toolAgent: ToolAgent,
        @inject(TYPES.EditModeManager) private editModeManager: EditModeManager,
        @inject(TYPES.SecurityPolicyEngine) private securityEngine: SecurityPolicyEngine) { }

    async executeToolSafely(
        iteration: number,
        action: { tool: string, args: any }
    ): Promise<{ result?: any, error?: string, duration?: number }> {
        const startTime = Date.now();

        try {
            const editMode = this.editModeManager.getCurrentMode();

            // Plan Mode下的写操作拦截
            if (editMode === EditMode.PLAN_ONLY) {
                // 检查是否是写操作
                const isWriteOp = this.isWriteOperation(action.tool, action.args);

                if (isWriteOp) {
                    return {
                        result: {
                            planMode: true,
                            simulatedOperation: action.tool,
                            parameters: action.args,
                            message: `[PLAN MODE] Would execute ${action.tool} - execution blocked in plan mode`,
                            estimatedImpact: this.estimateImpact(action.tool, action.args)
                        },
                        duration: Date.now() - startTime
                    };
                }
            }

            // 正常执行
            const result = await this.toolAgent.executeTool(action.tool, action.args);
            return { result, duration: Date.now() - startTime };

        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown tool error',
                duration: Date.now() - startTime
            };
        }
    }

    private isWriteOperation(toolName: string, args: any): boolean {
        // 使用现有的安全引擎来判断写操作
        const writeTools = [
            ToolNames.WRITE_FILE,
            ToolNames.CREATE_FILE,
            ToolNames.APPLY_PATCH
        ];

        if (writeTools.includes(toolName)) {
            return true;
        }

        // 检查shell命令
        if (toolName === ToolNames.SHELL_EXECUTOR && args && args.command) {
            return this.securityEngine.isWriteOperation(args.command);
        }

        if (toolName === ToolNames.MULTI_COMMAND && args && args.commands) {
            return args.commands.some((cmd: any) =>
                cmd.command && this.securityEngine.isWriteOperation(cmd.command)
            );
        }

        return false;
    }

    private estimateImpact(toolName: string, args: any): string {
        switch (toolName) {
            case ToolNames.WRITE_FILE:
            case ToolNames.CREATE_FILE:
                return `Would create/modify file: ${args.filePath}`;
            case ToolNames.APPLY_PATCH:
                return `Would apply patch to: ${args.filePath}`;
            case ToolNames.SHELL_EXECUTOR:
                return `Would execute command: ${args.command}`;
            case ToolNames.MULTI_COMMAND:
                const cmdCount = args.commands?.length || 0;
                return `Would execute ${cmdCount} commands`;
            default:
                return `Would execute ${toolName} operation`;
        }
    }
}
