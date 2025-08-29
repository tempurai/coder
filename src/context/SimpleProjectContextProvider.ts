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
     * 提供基础项目信息，具体细节通过Agent工具动态拉取
     */
    public getStaticContext(): string {
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
            '---'
        ];

        return contextParts.join('\n');
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