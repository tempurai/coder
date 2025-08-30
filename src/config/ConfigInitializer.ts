import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { injectable } from 'inversify';
import { fileURLToPath } from 'url';

@injectable()
export class ConfigInitializer {
  private readonly globalConfigDir: string;
  private readonly globalConfigFilePath: string;
  private readonly globalContextFilePath: string;
  private readonly projectConfigDir: string;
  private readonly projectConfigFilePath: string;
  private readonly projectContextFilePath: string;
  private readonly templatesDir: string;

  constructor() {
    this.globalConfigDir = path.join(os.homedir(), '.tempurai');
    this.globalConfigFilePath = path.join(this.globalConfigDir, 'config.json');
    this.globalContextFilePath = path.join(this.globalConfigDir, '.tempurai.md');
    this.projectConfigDir = path.join(process.cwd(), '.tempurai');
    this.projectConfigFilePath = path.join(this.projectConfigDir, 'config.json');
    this.projectContextFilePath = path.join(this.projectConfigDir, '.tempurai.md');

    // 模板文件目录
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    this.templatesDir = path.join(__dirname, 'templates');
  }

  globalConfigExists(): boolean {
    return fs.existsSync(this.globalConfigFilePath);
  }

  projectConfigExists(): boolean {
    return fs.existsSync(this.projectConfigFilePath);
  }

  createGlobalFiles(): void {
    try {
      fs.mkdirSync(this.globalConfigDir, { recursive: true });

      // 复制配置模板
      const configTemplatePath = path.join(this.templatesDir, 'example-config.json');
      fs.copyFileSync(configTemplatePath, this.globalConfigFilePath);

      // 复制上下文模板
      const contextTemplatePath = path.join(this.templatesDir, 'example.tempurai.md');
      fs.copyFileSync(contextTemplatePath, this.globalContextFilePath);

      console.log(`Created global config at ${this.globalConfigFilePath}`);
      console.log(`Created global context at ${this.globalContextFilePath}`);
      console.log('Please edit these files to add your API keys and customize settings.');
    } catch (error) {
      console.error(`❌ Failed to create global config: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  createProjectFiles(): void {
    try {
      fs.mkdirSync(this.projectConfigDir, { recursive: true });

      // 复制配置模板
      const configTemplatePath = path.join(this.templatesDir, 'example-config.json');
      fs.copyFileSync(configTemplatePath, this.projectConfigFilePath);

      // 复制上下文模板
      const contextTemplatePath = path.join(this.templatesDir, 'example.tempurai.md');
      fs.copyFileSync(contextTemplatePath, this.projectContextFilePath);

      console.log(`Created project config at ${this.projectConfigFilePath}`);
      console.log(`Created project context at ${this.projectContextFilePath}`);
    } catch (error) {
      console.warn(`⚠️ Failed to create project config: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async initializeGlobalFiles(): Promise<void> {
    if (this.globalConfigExists()) {
      return;
    }

    console.log('First time setup: Creating configuration files...');
    this.createGlobalFiles();
    console.log('Configuration initialized successfully!');
  }

  getConfigDir(): string {
    return this.globalConfigDir;
  }

  getConfigPath(): string {
    return this.globalConfigFilePath;
  }

  getContextPath(): string {
    return this.globalContextFilePath;
  }
}