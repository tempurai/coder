import { exec } from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { tool } from 'ai';
import * as acorn from 'acorn';
import * as acornWalk from 'acorn-walk';

const execAsync = util.promisify(exec);

export const findFunctionsTool = tool({
    description: 'Find function definitions in the codebase',
    inputSchema: z.object({
        functionName: z.string().describe('Name of the function to search for'),
    }),
    execute: async ({ functionName }) => {
        try {
            const { stdout } = await execAsync(`grep -r "function ${functionName}\\|${functionName} =" --include="*.ts" --include="*.js" .`);
            return { success: true, result: stdout.trim() || 'No functions found' };
        } catch (error) {
            return { success: false, result: 'No functions found' };
        }
    },
});

export const findImportsTool = tool({
    description: 'Find import statements for a specific module',
    inputSchema: z.object({
        module: z.string().describe('Name of the module to search for'),
    }),
    execute: async ({ module }) => {
        try {
            const { stdout } = await execAsync(`grep -r "import.*${module}\\|require.*${module}" --include="*.ts" --include="*.js" .`);
            return { success: true, result: stdout.trim() || 'No imports found' };
        } catch (error) {
            return { success: false, result: 'No imports found' };
        }
    },
});

export const getProjectStructureTool = tool({
    description: 'Get the directory structure of the project',
    inputSchema: z.object({}),
    execute: async () => {
        try {
            const { stdout } = await execAsync('find . -type f -name "*.ts" -o -name "*.js" -o -name "*.json" | grep -v node_modules | sort');
            return { success: true, result: stdout.trim() };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
});

export const analyzeCodeStructureTool = tool({
    description: `Analyze the structure of a JavaScript/TypeScript file using AST parsing.
    Returns detailed information about:
    - Functions and their parameters
    - Classes and their methods
    - Import/export statements
    - Variable declarations
    - Code complexity metrics
    This provides the Agent with deep code insight for better understanding and modification.`,
    inputSchema: z.object({
        filePath: z.string().describe('Path to the JavaScript/TypeScript file to analyze'),
        includeBody: z.boolean().default(false).describe('Include function/method body content in analysis')
    }),
    execute: async ({ filePath, includeBody }) => {
        console.log(`🔍 Analyzing code structure: ${filePath}`);
        try {
            const absolutePath = path.resolve(filePath);
            if (!fs.existsSync(absolutePath)) {
                return {
                    success: false,
                    filePath,
                    error: `File not found: ${filePath}`
                };
            }

            const content = await fs.promises.readFile(absolutePath, 'utf-8');

            const ext = path.extname(filePath).toLowerCase();
            if (!['.js', '.ts', '.jsx', '.tsx', '.mjs'].includes(ext)) {
                return {
                    success: false,
                    filePath,
                    error: `Unsupported file type: ${ext}. Only JavaScript/TypeScript files are supported.`
                };
            }

            let ast;
            try {
                ast = acorn.parse(content, {
                    ecmaVersion: 2022,
                    sourceType: 'module',
                    allowHashBang: true,
                    locations: true
                });
            } catch (parseError) {
                try {
                    ast = acorn.parse(content, {
                        ecmaVersion: 2022,
                        sourceType: 'script',
                        allowHashBang: true,
                        locations: true
                    });
                } catch (scriptError) {
                    return {
                        success: false,
                        filePath,
                        error: `Failed to parse file: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`
                    };
                }
            }

            const analysis = {
                imports: [] as Array<{
                    type: string;
                    source: string;
                    specifiers: string[];
                    line: number;
                }>,
                exports: [] as Array<{
                    type: string;
                    name: string;
                    line: number;
                }>,
                functions: [] as Array<{
                    name: string;
                    type: string;
                    parameters: string[];
                    isAsync: boolean;
                    isGenerator: boolean;
                    line: number;
                    body?: string;
                }>,
                classes: [] as Array<{
                    name: string;
                    superClass?: string;
                    methods: Array<{
                        name: string;
                        type: string;
                        parameters: string[];
                        isAsync: boolean;
                        isStatic: boolean;
                        line: number;
                    }>;
                    properties: string[];
                    line: number;
                }>,
                variables: [] as Array<{
                    name: string;
                    type: string;
                    line: number;
                }>,
                complexity: {
                    totalLines: content.split('\n').length,
                    functionsCount: 0,
                    classesCount: 0,
                    importsCount: 0,
                    exportsCount: 0
                }
            };

            acornWalk.full(ast, (node: any) => {
                if (node.type === 'ImportDeclaration') {
                    const specifiers = node.specifiers?.map((spec: any) => {
                        if (spec.type === 'ImportDefaultSpecifier') return 'default';
                        if (spec.type === 'ImportNamespaceSpecifier') return `* as ${spec.local.name}`;
                        return spec.imported?.name || spec.local?.name || 'unknown';
                    }) || [];
                    analysis.imports.push({
                        type: 'import',
                        source: node.source?.value || '',
                        specifiers,
                        line: node.loc?.start?.line || 0
                    });
                }

                if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
                    const exportName = node.declaration?.id?.name ||
                        node.declaration?.name ||
                        (node.type === 'ExportDefaultDeclaration' ? 'default' : 'unknown');
                    analysis.exports.push({
                        type: node.type === 'ExportDefaultDeclaration' ? 'default' : 'named',
                        name: exportName,
                        line: node.loc?.start?.line || 0
                    });
                }

                if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
                    const params = node.params?.map((param: any) => {
                        if (param.type === 'Identifier') return param.name;
                        if (param.type === 'AssignmentPattern') return `${param.left.name}?`;
                        if (param.type === 'RestElement') return `...${param.argument.name}`;
                        return 'unknown';
                    }) || [];

                    let functionBody = '';
                    if (includeBody && node.body) {
                        const bodyStart = node.body.start;
                        const bodyEnd = node.body.end;
                        functionBody = content.slice(bodyStart, bodyEnd);
                    }

                    analysis.functions.push({
                        name: node.id?.name || 'anonymous',
                        type: node.type,
                        parameters: params,
                        isAsync: node.async || false,
                        isGenerator: node.generator || false,
                        line: node.loc?.start?.line || 0,
                        ...(includeBody && { body: functionBody })
                    });
                }

                if (node.type === 'ClassDeclaration') {
                    const methods = node.body?.body?.filter((member: any) => member.type === 'MethodDefinition')
                        .map((method: any) => ({
                            name: method.key?.name || 'unknown',
                            type: method.kind || 'method',
                            parameters: method.value?.params?.map((param: any) => param.name || 'unknown') || [],
                            isAsync: method.value?.async || false,
                            isStatic: method.static || false,
                            line: method.loc?.start?.line || 0
                        })) || [];

                    const properties = node.body?.body?.filter((member: any) => member.type === 'PropertyDefinition')
                        .map((prop: any) => prop.key?.name || 'unknown') || [];

                    analysis.classes.push({
                        name: node.id?.name || 'anonymous',
                        superClass: node.superClass?.name,
                        methods,
                        properties,
                        line: node.loc?.start?.line || 0
                    });
                }

                if (node.type === 'VariableDeclaration') {
                    node.declarations?.forEach((decl: any) => {
                        if (decl.id?.name) {
                            analysis.variables.push({
                                name: decl.id.name,
                                type: node.kind,
                                line: decl.loc?.start?.line || 0
                            });
                        }
                    });
                }
            });

            analysis.complexity.functionsCount = analysis.functions.length;
            analysis.complexity.classesCount = analysis.classes.length;
            analysis.complexity.importsCount = analysis.imports.length;
            analysis.complexity.exportsCount = analysis.exports.length;

            console.log(`✅ Code structure analyzed successfully`);
            console.log(`📊 Found: ${analysis.functions.length} functions, ${analysis.classes.length} classes, ${analysis.imports.length} imports`);

            return {
                success: true,
                filePath: absolutePath,
                fileType: ext,
                analysis,
                message: `Code structure analyzed for '${filePath}'`
            };
        } catch (error) {
            console.error(`❌ Failed to analyze code structure: ${error}`);
            return {
                success: false,
                filePath,
                error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
});
