import { exec } from 'child_process';
import * as fs from 'fs';
import * as util from 'util';
import { z } from 'zod';

const execAsync = util.promisify(exec);

export const findFilesTool = {
    id: 'find_files',
    name: 'Find Files',
    description: 'Search for files by pattern in the current directory',
    parameters: z.object({
        pattern: z.string().describe('File name pattern to search for'),
    }),
    execute: async ({ pattern }: { pattern: string }) => {
        try {
            const { stdout } = await execAsync(`find . -name "*${pattern}*" -type f`);
            return { success: true, result: stdout.trim() };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
};

export const searchInFilesTool = {
    id: 'search_in_files',
    name: 'Search in Files',
    description: 'Search for keywords in TypeScript and JavaScript files',
    parameters: z.object({
        keyword: z.string().describe('Keyword to search for in files'),
    }),
    execute: async ({ keyword }: { keyword: string }) => {
        try {
            const { stdout } = await execAsync(`grep -r "${keyword}" --include="*.ts" --include="*.js" .`);
            return { success: true, result: stdout.trim() };
        } catch (error) {
            return { success: false, result: 'No matches found' };
        }
    },
};

export const readFileTool = {
    id: 'read_file',
    name: 'Read File',
    description: 'Read the contents of a file',
    parameters: z.object({
        path: z.string().describe('Path to the file to read'),
    }),
    execute: async ({ path }: { path: string }) => {
        try {
            const content = await fs.promises.readFile(path, 'utf8');
            return { success: true, result: content };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
};

export const writeFileTool = {
    id: 'write_file',
    name: 'Write File',
    description: 'Write content to a file',
    parameters: z.object({
        path: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file'),
    }),
    execute: async ({ path, content }: { path: string; content: string }) => {
        try {
            await fs.promises.writeFile(path, content);
            return { success: true, result: `Successfully wrote to ${path}` };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
};

export class FileTools {
    async findFiles(pattern: string): Promise<string> {
        const { stdout } = await execAsync(`find . -name "*${pattern}*" -type f`);
        return stdout;
    }

    async searchInFiles(keyword: string): Promise<string> {
        const { stdout } = await execAsync(`grep -r "${keyword}" --include="*.ts" --include="*.js" .`);
        return stdout;
    }

    async readFile(path: string): Promise<string> {
        return fs.promises.readFile(path, 'utf8');
    }

    async writeFile(path: string, content: string): Promise<void> {
        return fs.promises.writeFile(path, content);
    }
}