/**
 * 初始化协调器
 * 负责管理系统组件的初始化顺序，避免循环依赖，确保正确的初始化流程
 */

import { Config } from '../config/ConfigLoader';
import { SimpleAgent } from '../agents/SimpleAgent';
import { FileWatcherService } from '../services/FileWatcherService';
import { SessionService, SessionServiceDependencies } from '../session/SessionService';
import { ErrorHandler, ErrorCode } from '../errors/ErrorHandler';

/**
 * 初始化步骤接口
 */
export interface InitializationStep {
  name: string;
  execute: () => Promise<void>;
  dependencies: string[];
  result?: any;
}

/**
 * 初始化状态接口
 */
export interface InitializationStatus {
  totalSteps: number;
  completedSteps: number;
  currentStep?: string;
  isCompleted: boolean;
  errors: string[];
  results: Record<string, any>;
}

/**
 * 初始化协调器配置
 */
export interface InitializationConfig {
  config: Config;
  model?: any;
  customContext?: string;
  maxRetries?: number;
}

/**
 * 初始化协调器
 * 使用依赖图管理组件初始化顺序
 */
export class InitializationCoordinator {
  private steps: Map<string, InitializationStep> = new Map();
  private status: InitializationStatus;
  private config: InitializationConfig;
  private executedSteps: Set<string> = new Set();

  constructor(config: InitializationConfig) {
    this.config = config;
    this.status = {
      totalSteps: 0,
      completedSteps: 0,
      isCompleted: false,
      errors: [],
      results: {}
    };

    // 注册默认的初始化步骤
    this.registerDefaultSteps();
  }

  /**
   * 注册初始化步骤
   * @param step 初始化步骤
   */
  registerStep(step: InitializationStep): void {
    this.steps.set(step.name, step);
    this.status.totalSteps = this.steps.size;
  }

  /**
   * 执行初始化流程
   * 根据依赖关系按正确顺序执行所有步骤
   */
  async initialize(): Promise<InitializationStatus> {
    console.log('🚀 开始系统初始化...');
    
    try {
      // 生成执行顺序（拓扑排序）
      const executionOrder = this.topologicalSort();
      console.log(`📋 初始化步骤顺序: ${executionOrder.join(' → ')}`);

      // 按顺序执行步骤
      for (const stepName of executionOrder) {
        await this.executeStep(stepName);
      }

      this.status.isCompleted = true;
      console.log('✅ 系统初始化完成');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知初始化错误';
      this.status.errors.push(errorMessage);
      ErrorHandler.logError(error, { context: 'InitializationCoordinator', step: this.status.currentStep });
      
      throw new Error(`系统初始化失败: ${errorMessage}`);
    }

    return this.status;
  }

  /**
   * 获取初始化状态
   */
  getStatus(): InitializationStatus {
    return { ...this.status };
  }

  /**
   * 获取初始化结果
   * @param stepName 步骤名称
   */
  getResult<T = any>(stepName: string): T | undefined {
    return this.status.results[stepName];
  }

  /**
   * 注册默认的初始化步骤
   */
  private registerDefaultSteps(): void {
    // 步骤1: 配置验证
    this.registerStep({
      name: 'config-validation',
      dependencies: [],
      execute: async () => {
        console.log('🔧 验证配置...');
        // 这里可以添加配置验证逻辑
        if (!this.config.config) {
          throw new Error('配置对象不能为空');
        }
        this.status.results['config-validation'] = { valid: true, config: this.config.config };
      }
    });

    // 步骤2: 创建SimpleAgent
    this.registerStep({
      name: 'simple-agent',
      dependencies: ['config-validation'],
      execute: async () => {
        console.log('🤖 创建SimpleAgent...');
        const agent = new SimpleAgent(
          this.config.config,
          this.config.model,
          this.config.customContext
        );
        
        // 异步初始化Agent
        await agent.initializeAsync(this.config.customContext);
        
        this.status.results['simple-agent'] = agent;
      }
    });

    // 步骤3: 创建FileWatcherService
    this.registerStep({
      name: 'file-watcher',
      dependencies: ['config-validation'],
      execute: async () => {
        console.log('👁️ 创建文件监听服务...');
        const fileWatcher = new FileWatcherService({
          verbose: false // 简化配置，避免Config接口依赖
        });
        
        this.status.results['file-watcher'] = fileWatcher;
      }
    });

    // 步骤4: 创建SessionService
    this.registerStep({
      name: 'session-service',
      dependencies: ['simple-agent', 'file-watcher'],
      execute: async () => {
        console.log('📋 创建会话服务...');
        const agent = this.status.results['simple-agent'];
        const fileWatcher = this.status.results['file-watcher'];
        
        const sessionDependencies: SessionServiceDependencies = {
          agent,
          fileWatcher,
          config: this.config.config
        };
        
        const sessionService = new SessionService(sessionDependencies);
        
        this.status.results['session-service'] = sessionService;
      }
    });

    // 步骤5: 系统就绪检查
    this.registerStep({
      name: 'readiness-check',
      dependencies: ['session-service'],
      execute: async () => {
        console.log('✅ 执行系统就绪检查...');
        const agent = this.status.results['simple-agent'];
        const sessionService = this.status.results['session-service'];
        
        // 检查Agent健康状态
        const agentHealth = await agent.healthCheck();
        if (agentHealth.status !== 'healthy') {
          throw new Error(`Agent健康检查失败: ${agentHealth.message}`);
        }
        
        // 检查SessionService状态
        const sessionHealth = await sessionService.checkAgentHealth();
        if (sessionHealth.status !== 'healthy') {
          throw new Error(`SessionService健康检查失败: ${sessionHealth.message}`);
        }
        
        this.status.results['readiness-check'] = {
          agentHealth,
          sessionHealth,
          ready: true
        };
      }
    });
  }

  /**
   * 执行单个初始化步骤
   * @param stepName 步骤名称
   */
  private async executeStep(stepName: string): Promise<void> {
    if (this.executedSteps.has(stepName)) {
      return; // 步骤已执行
    }

    const step = this.steps.get(stepName);
    if (!step) {
      throw new Error(`初始化步骤不存在: ${stepName}`);
    }

    // 检查依赖是否都已完成
    for (const dependency of step.dependencies) {
      if (!this.executedSteps.has(dependency)) {
        throw new Error(`步骤 ${stepName} 的依赖 ${dependency} 未完成`);
      }
    }

    this.status.currentStep = stepName;
    const startTime = Date.now();

    try {
      console.log(`⏳ 执行步骤: ${stepName}...`);
      await step.execute();
      
      this.executedSteps.add(stepName);
      this.status.completedSteps++;
      
      const duration = Date.now() - startTime;
      console.log(`✅ 步骤完成: ${stepName} (${duration}ms)`);
      
    } catch (error) {
      const errorMessage = `步骤 ${stepName} 执行失败: ${error instanceof Error ? error.message : '未知错误'}`;
      this.status.errors.push(errorMessage);
      
      // 根据配置决定是否重试
      const maxRetries = this.config.maxRetries || 0;
      if (maxRetries > 0) {
        console.warn(`⚠️ ${errorMessage}, 准备重试...`);
        // 这里可以添加重试逻辑
      }
      
      throw new Error(errorMessage);
    } finally {
      this.status.currentStep = undefined;
    }
  }

  /**
   * 拓扑排序生成执行顺序
   * 确保依赖的步骤先执行
   */
  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (stepName: string): void => {
      if (visiting.has(stepName)) {
        throw new Error(`检测到循环依赖: ${stepName}`);
      }
      
      if (visited.has(stepName)) {
        return;
      }

      const step = this.steps.get(stepName);
      if (!step) {
        throw new Error(`初始化步骤不存在: ${stepName}`);
      }

      visiting.add(stepName);

      // 先访问所有依赖
      for (const dependency of step.dependencies) {
        visit(dependency);
      }

      visiting.delete(stepName);
      visited.add(stepName);
      result.push(stepName);
    };

    // 访问所有步骤
    for (const stepName of Array.from(this.steps.keys())) {
      visit(stepName);
    }

    return result;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 清理初始化协调器资源...');
    
    // 清理创建的服务
    try {
      const sessionService = this.status.results['session-service'];
      if (sessionService) {
        await sessionService.cleanup();
      }

      const agent = this.status.results['simple-agent'];
      if (agent) {
        await agent.cleanup();
      }

      const fileWatcher = this.status.results['file-watcher'];
      if (fileWatcher) {
        fileWatcher.cleanup();
      }
    } catch (error) {
      console.warn('⚠️ 清理过程中出现错误:', error);
    }

    console.log('✅ 初始化协调器资源清理完成');
  }
}

/**
 * 便捷的初始化函数
 * @param config 初始化配置
 * @returns 初始化协调器实例
 */
export async function createSystemComponents(config: InitializationConfig): Promise<{
  coordinator: InitializationCoordinator;
  agent: SimpleAgent;
  sessionService: SessionService;
  fileWatcher: FileWatcherService;
}> {
  const coordinator = new InitializationCoordinator(config);
  await coordinator.initialize();

  return {
    coordinator,
    agent: coordinator.getResult('simple-agent'),
    sessionService: coordinator.getResult('session-service'),
    fileWatcher: coordinator.getResult('file-watcher')
  };
}