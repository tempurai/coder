import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';
import { tool } from 'ai';
import { ToolContext, ToolNames } from './ToolRegistry.js';
import { ToolExecutionStartedEvent } from '../events/EventTypes.js';
import { ToolExecutionResult } from './ToolRegistry.js';

const execAsync = util.promisify(exec);

export const createCreateFileTool = (context: ToolContext) => tool({
    description: `Create a new file with content.
    Fails if the file already exists to prevent accidental overwrites.
    Use this tool when you want to ensure you're creating a completely new file.`,
    inputSchema: z.object({
        filePath: z.string().describe('Path to the new file to create'),
        content: z.string().describe('Content to write to the new file'),
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ filePath, content, toolExecutionId }): Promise<ToolExecutionResult> => {
        const displayTitle = `Create(${filePath})`;

        // 发送开始事件
        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.CREATE_FILE,
            args: { filePath, content },
            toolExecutionId: toolExecutionId!,
            displayTitle,
        } as ToolExecutionStartedEvent);

        // 检查编辑权限
        const editModeManager = context.hitlManager.getEditModeManager();
        const permission = editModeManager.checkEditPermission(ToolNames.CREATE_FILE, { filePath, content });

        if (!permission.allowed) {
            if (permission.needsConfirmation) {
                const confirmed = await context.hitlManager.requestEditConfirmation(
                    ToolNames.CREATE_FILE,
                    { filePath, content },
                    filePath
                );
                if (!confirmed) {
                    return {
                        error: 'File creation cancelled by user',
                        displayDetails: 'File creation cancelled by user',
                    };
                }
            } else {
                return {
                    error: permission.reason || 'File creation not allowed',
                    displayDetails: permission.reason || 'File creation blocked by current edit mode',
                };
            }
        }

        try {
            const absolutePath = path.resolve(filePath);

            if (fs.existsSync(absolutePath)) {
                return {
                    error: `File already exists: ${filePath}`,
                    displayDetails: `Cannot create file - it already exists: ${filePath}`,
                };
            }

            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            await fs.promises.writeFile(absolutePath, content, 'utf-8');

            return {
                result: { filePath: absolutePath, size: content.length },
                displayDetails: `New file created successfully (${content.length} characters)`,
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                displayDetails: `Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
});

export const createWriteFileTool = (context: ToolContext) => tool({
    description: `Write content to a file or overwrite an existing file. This operation is direct and atomic.`,
    inputSchema: z.object({
        filePath: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file'),
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ filePath, content, toolExecutionId }): Promise<ToolExecutionResult> => {
        const displayTitle = `Write(${filePath})`;

        // 发送开始事件
        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.WRITE_FILE,
            args: { filePath, content },
            toolExecutionId: toolExecutionId!,
            displayTitle,
        } as ToolExecutionStartedEvent);

        // 检查编辑权限
        const editModeManager = context.hitlManager.getEditModeManager();
        const permission = editModeManager.checkEditPermission(ToolNames.WRITE_FILE, { filePath, content });

        if (!permission.allowed) {
            if (permission.needsConfirmation) {
                const confirmed = await context.hitlManager.requestEditConfirmation(
                    ToolNames.WRITE_FILE,
                    { filePath, content },
                    filePath
                );
                if (!confirmed) {
                    return {
                        error: 'File write cancelled by user',
                        displayDetails: 'File write cancelled by user',
                    };
                }
            } else {
                return {
                    error: permission.reason || 'File write not allowed',
                    displayDetails: permission.reason || 'File write blocked by current edit mode',
                };
            }
        }

        try {
            const absolutePath = path.resolve(filePath);
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            await fs.promises.writeFile(absolutePath, content, 'utf-8');

            return {
                result: { filePath: absolutePath, size: content.length },
                displayDetails: `File written successfully (${content.length} characters)`,
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                displayDetails: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
});

export const createApplyPatchTool = (context: ToolContext) => tool({
    description: `Apply a unified diff patch to a file. 
    The LLM should generate the patch in standard unified diff format.
    This tool will apply the patch using the system patch command or fallback to manual application.`,
    inputSchema: z.object({
        filePath: z.string().describe('Path to the file to patch'),
        patchContent: z.string().describe('Unified diff content generated by LLM'),
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ filePath, patchContent, toolExecutionId }): Promise<ToolExecutionResult> => {
        const displayTitle = `Update(${filePath})`;

        // 发送开始事件
        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.APPLY_PATCH,
            args: { filePath, patchContent },
            toolExecutionId: toolExecutionId!,
            displayTitle,
        } as ToolExecutionStartedEvent);

        // 检查编辑权限
        const editModeManager = context.hitlManager.getEditModeManager();
        const permission = editModeManager.checkEditPermission(ToolNames.APPLY_PATCH, { filePath, patchContent });

        if (!permission.allowed) {
            if (permission.needsConfirmation) {
                const confirmed = await context.hitlManager.requestEditConfirmation(
                    ToolNames.APPLY_PATCH,
                    { filePath, patchContent },
                    filePath
                );
                if (!confirmed) {
                    return {
                        error: 'Patch application cancelled by user',
                        displayDetails: 'Patch application cancelled by user',
                    };
                }
            } else {
                return {
                    error: permission.reason || 'Patch application not allowed',
                    displayDetails: permission.reason || 'Patch application blocked by current edit mode',
                };
            }
        }

        try {
            const absolutePath = path.resolve(filePath);
            if (!fs.existsSync(absolutePath)) {
                return {
                    error: `File not found: ${filePath}`,
                    displayDetails: `File not found: ${filePath}`,
                };
            }

            const tempPatchFile = path.join(path.dirname(absolutePath), `.patch_${Date.now()}.tmp`);
            await fs.promises.writeFile(tempPatchFile, patchContent, 'utf-8');

            try {
                const patchCmd = `patch --no-backup-if-mismatch --reject-file=/dev/null "${absolutePath}" < "${tempPatchFile}"`;

                const { stdout, stderr } = await execAsync(patchCmd);
                await fs.promises.unlink(tempPatchFile);

                const addedLines = (patchContent.match(/^\+[^+]/gm) || []).length;
                const removedLines = (patchContent.match(/^-[^-]/gm) || []).length;

                return {
                    result: {
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        changesApplied: addedLines + removedLines,
                    },
                    displayDetails: patchContent,
                };
            } catch (patchError) {
                const result = await applyPatchManually(absolutePath, patchContent);
                await fs.promises.unlink(tempPatchFile);
                return result;
            }
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                displayDetails: `Failed to apply patch: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
});

async function applyPatchManually(filePath: string, patchContent: string): Promise<ToolExecutionResult> {
    function detectNewline(text: string): '\n' | '\r\n' {
        const idx = text.indexOf('\r\n');
        return idx !== -1 ? '\r\n' : '\n';
    }

    interface Change { type: 'add' | 'delete' | 'context'; content: string }
    interface Hunk {
        oldStart: number;
        oldCount: number;
        newStart: number;
        newCount: number;
        changes: Change[];
    }

    try {
        const originalContent = await fs.promises.readFile(filePath, 'utf-8');
        const eol = detectNewline(originalContent);
        const originalLines = originalContent.split(/\r?\n/);

        const patchLines = patchContent.split(/\r?\n/);
        const hunks: Hunk[] = [];
        let currentHunk: Hunk | null = null;

        for (const line of patchLines) {
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
                if (match) {
                    currentHunk = {
                        oldStart: parseInt(match[1], 10) - 1,
                        oldCount: parseInt(match[2] || '1', 10),
                        newStart: parseInt(match[3], 10) - 1,
                        newCount: parseInt(match[4] || '1', 10),
                        changes: [],
                    };
                    hunks.push(currentHunk);
                } else {
                    currentHunk = null;
                }
            } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
                currentHunk.changes.push({
                    type: line[0] === '+' ? 'add' : line[0] === '-' ? 'delete' : 'context',
                    content: line.substring(1),
                });
            }
        }

        let modifiedLines = [...originalLines];
        let lineOffset = 0;

        for (const hunk of hunks) {
            let pos = hunk.oldStart + lineOffset;

            for (const change of hunk.changes) {
                if (change.type === 'context') {
                    if (modifiedLines[pos] !== change.content) {
                        throw new Error(`Context mismatch near line ${pos + 1}: expected "${change.content}" but got "${modifiedLines[pos]}"`);
                    }
                    pos++;
                } else if (change.type === 'delete') {
                    if (modifiedLines[pos] !== change.content) {
                        throw new Error(`Delete mismatch near line ${pos + 1}: expected "${change.content}" but got "${modifiedLines[pos]}"`);
                    }
                    modifiedLines.splice(pos, 1);
                    lineOffset--;
                } else if (change.type === 'add') {
                    modifiedLines.splice(pos, 0, change.content);
                    lineOffset++;
                    pos++;
                }
            }
        }

        await fs.promises.writeFile(filePath, modifiedLines.join(eol), 'utf-8');

        return {
            result: {
                changesApplied: hunks.length,
            },
            displayDetails: patchContent,
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : 'Manual patch application failed',
            displayDetails: `Manual patch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

export const createFindFilesTool = (context: ToolContext) => tool({
    description: 'Search for files by pattern in the current directory',
    inputSchema: z.object({
        pattern: z.string().describe('File name pattern to search for'),
        toolExecutionId: z.string().optional().describe('Tool execution ID (auto-generated)'),
    }),
    execute: async ({ pattern, toolExecutionId }): Promise<ToolExecutionResult> => {
        const displayTitle = `SearchFile(pattern: "${pattern}")`;

        context.eventEmitter.emit({
            type: 'tool_execution_started',
            toolName: ToolNames.FIND_FILES,
            args: { pattern },
            toolExecutionId: toolExecutionId!,
            displayTitle,
        } as ToolExecutionStartedEvent);

        try {
            const { stdout } = await execAsync(`find . -name "*${pattern}*" -type f`);
            const files = stdout.trim().split('\n').filter(f => f.length > 0);

            return {
                result: { files, count: files.length, pattern },
                displayDetails: files.join('\n') || 'No files found',
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                displayDetails: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
});

export const registerFileTools = (registry: any) => {
    const context = registry.getContext();
    registry.registerMultiple([
        { name: ToolNames.CREATE_FILE, tool: createCreateFileTool(context), category: 'file' },
        { name: ToolNames.WRITE_FILE, tool: createWriteFileTool(context), category: 'file' },
        { name: ToolNames.APPLY_PATCH, tool: createApplyPatchTool(context), category: 'file' },
        { name: ToolNames.FIND_FILES, tool: createFindFilesTool(context), category: 'file' }
    ]);
};