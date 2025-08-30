#!/usr/bin/env node

/**
 * Tempurai CLI - AI辅助编程CLI工具
 * 统一入口点：处理路由和应用启动
 * 
 * 路由规则:
 * - tempurai (无参数) -> 启动代码编辑界面 (InkUI)
 * - tempurai --help, config, version -> 系统命令模式
 */

import 'reflect-metadata';
import { bootstrapApplication, parseArguments } from './bootstrap.js';

/**
 * 错误处理器
 */
function setupErrorHandlers(): void {
  // 捕获未处理的Promise拒绝
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('💥 Unhandled Promise Rejection:', reason);
    process.exit(1);
  });

  // 捕获未捕获的异常
  process.on('uncaughtException', (error: Error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
  });
}

/**
 * 主函数 - 应用入口点
 */
async function main(): Promise<void> {
  try {
    // 设置错误处理
    setupErrorHandlers();

    // 解析命令行参数
    const args = process.argv.slice(2);

    // 启动应用
    await bootstrapApplication(args);

  } catch (error) {
    console.error('💥 应用启动失败:', error instanceof Error ? error.message : '未知错误');
    console.error('💡 请检查配置和环境设置');
    process.exit(1);
  }
}

// 只有直接执行时才运行main函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error('💥 致命错误:', error);
    process.exit(1);
  });
}

// 导出main函数供测试使用
export { main };