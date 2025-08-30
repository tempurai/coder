import * as path from 'path';
import * as fs from 'fs';

interface ProjectInfo {
    name: string;
    framework?: string;
    language?: string;
    hasTypeScript: boolean;
    hasReact: boolean;
    hasNodeJS: boolean;
}

/**
 * 简单的项目上下文提供者
 * 实现"混合模式"的静态上下文推送部分
 */
export class SimpleProjectContextProvider {
    private workingDirectory: string;

    constructor(workDir?: string) {
        this.workingDirectory = workDir || process.cwd();
    }

    /**
     * 生成静态的、高层级的项目上下文摘要
     * 优先读取项目本地的./.temurai/directives.md文件作为最重要的静态上下文
     * 如果不存在，提供基础项目信息，具体细节通过Agent工具动态拉取
     */
    public getStaticContext(): string {
        // 首先尝试读取项目本地的directives.md
        const projectDirectives = this.loadProjectDirectives();
        
        if (projectDirectives) {
            // 如果存在项目指令，将其作为主要上下文
            const currentTime = new Date().toLocaleString();
            const projectInfo = this.loadBasicProjectInfo();
            
            return [
                '## 🎯 Project Directives',
                '',
                projectDirectives,
                '',
                '---',
                `## 📋 Project Info: ${projectInfo.name} | ${projectInfo.language} | ${projectInfo.framework || 'No framework'} | ${currentTime}`,
                '',
                '> Use your tools (read_file, analyze_code_structure, find_files, etc.) to get detailed, real-time information about implementations.'
            ].join('\n');
        }

        // Fallback到默认的项目概览
        const projectInfo = this.loadBasicProjectInfo();
        const currentTime = new Date().toLocaleString();

        const contextParts = [
            '## 📋 Project Overview',
            `- **Project Name**: ${projectInfo.name}`,
            `- **Working Directory**: ${this.workingDirectory}`,
            `- **Language**: ${projectInfo.language}`,
            `- **Framework**: ${projectInfo.framework || 'None detected'}`,
            `- **TypeScript**: ${projectInfo.hasTypeScript ? 'Yes' : 'No'}`,
            `- **React**: ${projectInfo.hasReact ? 'Yes' : 'No'}`,
            `- **Node.js**: ${projectInfo.hasNodeJS ? 'Yes' : 'No'}`,
            `- **Timestamp**: ${currentTime}`,
            '',
            '> This is a high-level overview. Use your tools (read_file, find_files, etc.) to get detailed, real-time information about specific files and implementations.',
            '> 💡 To provide project-specific context, create ./.temurai/directives.md in your project root.',
            '---'
        ];

        return contextParts.join('\n');
    }

    /**
     * 加载项目本地指令文件
     * 从./.temurai/directives.md读取项目特定的上下文和指令
     * @returns 指令内容，如果文件不存在或读取失败则返回undefined
     */
    private loadProjectDirectives(): string | undefined {
        try {
            const directivesPath = path.join(this.workingDirectory, '.temurai', 'directives.md');
            
            if (fs.existsSync(directivesPath)) {
                const directivesContent = fs.readFileSync(directivesPath, 'utf8');
                const content = directivesContent.trim();
                
                if (content) {
                    console.log(`📋 Loaded project directives from ${directivesPath}`);
                    return content;
                }
            }
        } catch (error) {
            console.warn(`⚠️ Failed to load project directives: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return undefined;
    }

    /**
     * 加载基本项目信息
     * 快速检查常见文件以确定项目类型
     */
    private loadBasicProjectInfo(): ProjectInfo {
        const projectName = path.basename(this.workingDirectory);
        
        let hasTypeScript = false;
        let hasReact = false;
        let hasNodeJS = false;
        let framework: string | undefined;
        let language = 'JavaScript';

        try {
            // 检查package.json
            const packageJsonPath = path.join(this.workingDirectory, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageContent = fs.readFileSync(packageJsonPath, 'utf-8');
                const packageInfo = JSON.parse(packageContent);
                const deps = { ...packageInfo.dependencies, ...packageInfo.devDependencies };
                
                hasReact = Boolean(deps?.react);
                hasNodeJS = Boolean(packageInfo.main) || Boolean(deps?.express) || Boolean(deps?.fastify);
                
                if (hasReact) framework = 'React';
                else if (deps?.vue) framework = 'Vue';
                else if (deps?.['@angular/core']) framework = 'Angular';
                else if (hasNodeJS) framework = 'Node.js';
            }

            // 检查TypeScript
            const tsconfigPath = path.join(this.workingDirectory, 'tsconfig.json');
            if (fs.existsSync(tsconfigPath)) {
                hasTypeScript = true;
                language = 'TypeScript';
            }

        } catch (error) {
            // 如果解析失败，使用默认值
            console.warn('⚠️ Failed to parse project info, using defaults');
        }

        return {
            name: projectName,
            framework,
            language,
            hasTypeScript,
            hasReact,
            hasNodeJS
        };
    }

    /**
     * 获取工作目录
     */
    public getWorkingDirectory(): string {
        return this.workingDirectory;
    }

    /**
     * 设置工作目录
     */
    public setWorkingDirectory(directory: string): void {
        this.workingDirectory = path.resolve(directory);
    }
}