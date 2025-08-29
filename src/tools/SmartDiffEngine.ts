import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import { exec } from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(exec);

export const smartDiffApplyTool = {
    id: 'smart_diff_apply',
    name: 'Smart Diff Apply',
    description: `Intelligently apply diffs with automatic retry and validation mechanisms.
    
    This tool:
    1. Attempts to apply the diff using patch
    2. If failed, tries alternative strategies (fuzzy matching, manual application)
    3. Validates the result (syntax check, compilation)
    4. Can request LLM to regenerate diff if all attempts fail
    5. Creates automatic backups
    
    PREFERRED over direct file writing for code modifications.`,
    parameters: z.object({
        filePath: z.string().describe('Path to the file to modify'),
        diffContent: z.string().describe('Unified diff content to apply'),
        description: z.string().describe('Description of changes being made'),
        validateAfter: z.boolean().default(true).describe('Whether to validate file after applying diff'),
        maxRetries: z.number().default(3).describe('Maximum retry attempts'),
        fallbackToReplace: z.boolean().default(true).describe('Whether to offer full file replacement as fallback'),
    }),
    execute: async ({ filePath, diffContent, description, validateAfter, maxRetries, fallbackToReplace }: {
        filePath: string;
        diffContent: string;
        description: string;
        validateAfter: boolean;
        maxRetries: number;
        fallbackToReplace: boolean;
    }) => {
        console.log(`🎯 Applying diff to: ${filePath}`);
        console.log(`📝 Description: ${description}`);
        
        const results = {
            success: false,
            method: '',
            backupCreated: false,
            backupPath: '',
            validationPassed: false,
            attempts: [] as any[],
            finalError: '',
            needsLLMRegeneration: false
        };
        
        // Create backup
        try {
            const backupPath = `${filePath}.backup.${Date.now()}`;
            await fs.promises.copyFile(filePath, backupPath);
            results.backupCreated = true;
            results.backupPath = backupPath;
            console.log(`💾 Backup created: ${backupPath}`);
        } catch (error) {
            console.log(`⚠️ Could not create backup: ${error}`);
        }
        
        // Attempt 1: Direct patch application
        console.log(`\n🔧 Attempt 1: Direct patch application`);
        const patchResult = await attemptPatchApplication(filePath, diffContent);
        results.attempts.push(patchResult);
        
        if (patchResult.success) {
            results.success = true;
            results.method = 'direct_patch';
        } else {
            console.log(`❌ Direct patch failed: ${patchResult.error}`);
            
            // Attempt 2: Fuzzy patch application
            if (maxRetries > 1) {
                console.log(`\n🔧 Attempt 2: Fuzzy patch application`);
                const fuzzyResult = await attemptFuzzyPatch(filePath, diffContent);
                results.attempts.push(fuzzyResult);
                
                if (fuzzyResult.success) {
                    results.success = true;
                    results.method = 'fuzzy_patch';
                } else {
                    console.log(`❌ Fuzzy patch failed: ${fuzzyResult.error}`);
                }
            }
            
            // Attempt 3: Manual diff application (parse and apply manually)
            if (!results.success && maxRetries > 2) {
                console.log(`\n🔧 Attempt 3: Manual diff parsing and application`);
                const manualResult = await attemptManualDiffApplication(filePath, diffContent);
                results.attempts.push(manualResult);
                
                if (manualResult.success) {
                    results.success = true;
                    results.method = 'manual_parsing';
                } else {
                    console.log(`❌ Manual application failed: ${manualResult.error}`);
                }
            }
        }
        
        // Validation
        if (results.success && validateAfter) {
            console.log(`\n🔍 Validating modified file...`);
            const validation = await validateFile(filePath);
            results.validationPassed = validation.success;
            
            if (!validation.success) {
                console.log(`❌ Validation failed: ${validation.error}`);
                results.success = false;
                results.finalError = `Diff applied but validation failed: ${validation.error}`;
                
                // Restore from backup if validation fails
                if (results.backupCreated) {
                    console.log(`🔄 Restoring from backup due to validation failure`);
                    await fs.promises.copyFile(results.backupPath, filePath);
                }
            } else {
                console.log(`✅ Validation passed`);
            }
        }
        
        // Final fallback suggestion
        if (!results.success && fallbackToReplace) {
            results.needsLLMRegeneration = true;
            results.finalError = 'All diff application methods failed. Consider:\n' +
                '1. Ask LLM to regenerate a simpler diff\n' +
                '2. Ask LLM to provide the complete modified file content\n' +
                '3. Manual review of the diff format and target file state';
        }
        
        return {
            success: results.success,
            method: results.method,
            backupCreated: results.backupCreated,
            backupPath: results.backupPath,
            validationPassed: results.validationPassed,
            attempts: results.attempts.length,
            needsLLMRegeneration: results.needsLLMRegeneration,
            error: results.finalError,
            suggestion: results.needsLLMRegeneration ? 
                'Please regenerate the diff with smaller, more targeted changes, or provide the complete file content.' : 
                undefined
        };
    },
};

export const generateDiffTool = {
    id: 'generate_diff',
    name: 'Generate Diff',
    description: 'Generate a unified diff between two versions of content. Use this before applying changes.',
    parameters: z.object({
        originalFilePath: z.string().describe('Path to the original file'),
        newContent: z.string().describe('New content to compare against'),
        contextLines: z.number().default(3).describe('Number of context lines in diff'),
    }),
    execute: async ({ originalFilePath, newContent, contextLines }: {
        originalFilePath: string;
        newContent: string;
        contextLines: number;
    }) => {
        try {
            const tempFile = path.join(os.tmpdir(), `temp_${Date.now()}.tmp`);
            await fs.promises.writeFile(tempFile, newContent);
            
            try {
                const { stdout } = await execAsync(`diff -u -U ${contextLines} "${originalFilePath}" "${tempFile}"`);
                await fs.promises.unlink(tempFile);
                return { success: true, diff: stdout };
            } catch (error: any) {
                // diff returns non-zero when files differ, but that's expected
                await fs.promises.unlink(tempFile);
                const diff = error.stdout || 'Files are identical';
                return { success: true, diff };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate diff'
            };
        }
    },
};

export const validateCodeTool = {
    id: 'validate_code',
    name: 'Validate Code',
    description: 'Validate code files using appropriate tools (TypeScript compiler, linters, etc.)',
    parameters: z.object({
        filePath: z.string().describe('Path to file to validate'),
        validationType: z.enum(['typescript', 'javascript', 'lint', 'auto']).default('auto').describe('Type of validation'),
    }),
    execute: async ({ filePath, validationType }: {
        filePath: string;
        validationType: string;
    }) => {
        const ext = path.extname(filePath);
        const validation = await validateFile(filePath, validationType === 'auto' ? undefined : validationType);
        
        return {
            success: validation.success,
            filePath,
            validationType: validation.method,
            output: validation.output,
            error: validation.error
        };
    },
};

// Helper functions

async function attemptPatchApplication(filePath: string, diffContent: string): Promise<any> {
    try {
        const tempDiff = path.join(os.tmpdir(), `patch_${Date.now()}.diff`);
        await fs.promises.writeFile(tempDiff, diffContent);
        
        const { stdout, stderr } = await execAsync(`patch "${filePath}" < "${tempDiff}"`);
        await fs.promises.unlink(tempDiff);
        
        return {
            success: true,
            method: 'direct_patch',
            output: stdout,
            stderr: stderr
        };
    } catch (error: any) {
        return {
            success: false,
            method: 'direct_patch',
            error: error.message,
            stdout: error.stdout,
            stderr: error.stderr
        };
    }
}

async function attemptFuzzyPatch(filePath: string, diffContent: string): Promise<any> {
    try {
        const tempDiff = path.join(os.tmpdir(), `fuzzy_${Date.now()}.diff`);
        await fs.promises.writeFile(tempDiff, diffContent);
        
        // Try with fuzzy matching (--fuzz=2 allows up to 2 lines difference)
        const { stdout, stderr } = await execAsync(`patch --fuzz=2 "${filePath}" < "${tempDiff}"`);
        await fs.promises.unlink(tempDiff);
        
        return {
            success: true,
            method: 'fuzzy_patch',
            output: stdout,
            stderr: stderr
        };
    } catch (error: any) {
        return {
            success: false,
            method: 'fuzzy_patch',
            error: error.message,
            stdout: error.stdout,
            stderr: error.stderr
        };
    }
}

async function attemptManualDiffApplication(filePath: string, diffContent: string): Promise<any> {
    try {
        const originalContent = await fs.promises.readFile(filePath, 'utf8');
        const lines = originalContent.split('\n');
        
        // Parse unified diff
        const diffLines = diffContent.split('\n');
        const hunks = parseDiffHunks(diffLines);
        
        // Apply hunks in reverse order (to maintain line numbers)
        hunks.reverse();
        
        for (const hunk of hunks) {
            const { startLine, deleteCount, addCount, deletedLines, addedLines } = hunk;
            
            // Remove deleted lines
            lines.splice(startLine - 1, deleteCount);
            
            // Add new lines
            lines.splice(startLine - 1, 0, ...addedLines);
        }
        
        await fs.promises.writeFile(filePath, lines.join('\n'));
        
        return {
            success: true,
            method: 'manual_parsing',
            output: 'Successfully applied diff manually'
        };
    } catch (error: any) {
        return {
            success: false,
            method: 'manual_parsing',
            error: error.message
        };
    }
}

function parseDiffHunks(diffLines: string[]): any[] {
    const hunks = [];
    let currentHunk: any = null;
    
    for (const line of diffLines) {
        if (line.startsWith('@@')) {
            // New hunk header: @@ -1,4 +1,5 @@
            if (currentHunk) hunks.push(currentHunk);
            
            const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
            if (match) {
                currentHunk = {
                    startLine: parseInt(match[3]),
                    deleteCount: parseInt(match[2]),
                    addCount: parseInt(match[4]),
                    deletedLines: [],
                    addedLines: []
                };
            }
        } else if (currentHunk) {
            if (line.startsWith('-')) {
                currentHunk.deletedLines.push(line.substring(1));
            } else if (line.startsWith('+')) {
                currentHunk.addedLines.push(line.substring(1));
            }
            // Ignore context lines (start with ' ')
        }
    }
    
    if (currentHunk) hunks.push(currentHunk);
    return hunks;
}

async function validateFile(filePath: string, validationType?: string): Promise<any> {
    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);
    
    // Auto-detect validation type
    if (!validationType) {
        if (['.ts', '.tsx'].includes(ext)) validationType = 'typescript';
        else if (['.js', '.jsx'].includes(ext)) validationType = 'javascript';
        else validationType = 'none';
    }
    
    try {
        switch (validationType) {
            case 'typescript':
                // Try TypeScript compilation
                const { stdout: tscOutput, stderr: tscError } = await execAsync(
                    `tsc --noEmit --skipLibCheck "${filePath}"`,
                    { cwd: dir }
                );
                return {
                    success: true,
                    method: 'typescript',
                    output: 'TypeScript compilation successful',
                    stderr: tscError
                };
                
            case 'javascript':
                // Basic syntax check using node --check
                const { stdout: nodeOutput } = await execAsync(
                    `node --check "${filePath}"`,
                    { cwd: dir }
                );
                return {
                    success: true,
                    method: 'javascript',
                    output: 'JavaScript syntax check passed'
                };
                
            default:
                return {
                    success: true,
                    method: 'none',
                    output: 'No validation performed'
                };
        }
    } catch (error: any) {
        return {
            success: false,
            method: validationType,
            error: error.message,
            stdout: error.stdout,
            stderr: error.stderr
        };
    }
}