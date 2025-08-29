import { exec } from 'child_process';
import * as util from 'util';
import { z } from 'zod';

const execAsync = util.promisify(exec);

export const findFunctionsTool = {
    id: 'find_functions',
    name: 'Find Functions',
    description: 'Find function definitions in the codebase',
    parameters: z.object({
        functionName: z.string().describe('Name of the function to search for'),
    }),
    execute: async ({ functionName }: { functionName: string }) => {
        try {
            const { stdout } = await execAsync(`grep -r "function ${functionName}\\|${functionName} =" --include="*.ts" --include="*.js" .`);
            return { success: true, result: stdout.trim() || 'No functions found' };
        } catch (error) {
            return { success: false, result: 'No functions found' };
        }
    },
};

export const findImportsTool = {
    id: 'find_imports',
    name: 'Find Imports',
    description: 'Find import statements for a specific module',
    parameters: z.object({
        module: z.string().describe('Name of the module to search for'),
    }),
    execute: async ({ module }: { module: string }) => {
        try {
            const { stdout } = await execAsync(`grep -r "import.*${module}\\|require.*${module}" --include="*.ts" --include="*.js" .`);
            return { success: true, result: stdout.trim() || 'No imports found' };
        } catch (error) {
            return { success: false, result: 'No imports found' };
        }
    },
};

export const getProjectStructureTool = {
    id: 'get_project_structure',
    name: 'Get Project Structure',
    description: 'Get the directory structure of the project',
    parameters: z.object({}),
    execute: async () => {
        try {
            const { stdout } = await execAsync('find . -type f -name "*.ts" -o -name "*.js" -o -name "*.json" | grep -v node_modules | sort');
            return { success: true, result: stdout.trim() };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
};

export class CodeTools {
    async findFunctions(functionName: string): Promise<string> {
        const { stdout } = await execAsync(`grep -r "function ${functionName}\\|${functionName} =" .`);
        return stdout;
    }

    async findImports(module: string): Promise<string> {
        const { stdout } = await execAsync(`grep -r "import.*${module}\\|require.*${module}" .`);
        return stdout;
    }

    async getFileStructure(): Promise<string> {
        const { stdout } = await execAsync('tree -I node_modules');
        return stdout;
    }
}