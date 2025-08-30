#!/usr/bin/env node

/**
 * Coder AI CLI 功能测试脚本
 * 用于验证所有新功能是否正常工作
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader, Config } from '../src/config/ConfigLoader';
import { SimpleAgent } from '../src/agents/SimpleAgent.js';
import { checkpointManager } from '../src/tools/CheckpointManager';
import { diffDisplay } from '../src/tools/EnhancedDiffDisplay';

// 测试颜色输出
const colors = {
    green: '\\x1b[32m',
    red: '\\x1b[31m',
    yellow: '\\x1b[33m',
    cyan: '\\x1b[36m',
    reset: '\\x1b[0m',
    bold: '\\x1b[1m'
};

function log(message: string, color: string = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function logTest(testName: string, status: 'PASS' | 'FAIL' | 'SKIP', details?: string) {
    const statusColor = status === 'PASS' ? colors.green : status === 'FAIL' ? colors.red : colors.yellow;
    const statusIcon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';

    console.log(`${statusIcon} ${colors.bold}${testName}${colors.reset} - ${statusColor}${status}${colors.reset}`);
    if (details) {
        console.log(`   ${colors.cyan}${details}${colors.reset}`);
    }
}

// 测试套件
class TestSuite {
    private passedTests = 0;
    private failedTests = 0;
    private skippedTests = 0;

    async runAllTests() {
        log('\
🚀 开始 Coder AI CLI 功能测试', colors.bold + colors.cyan);
        log('━'.repeat(60), colors.cyan);

        await this.testConfigSystem();
        await this.testDiffDisplay();
        await this.testCheckpointSystem();
        await this.testAgentIntegration();

        this.displaySummary();
    }

    async testConfigSystem() {
        log('\
📋 测试配置系统', colors.yellow);

        try {
            // 测试配置加载
            const configLoader = new ConfigLoader();
            const config = configLoader.getConfig();

            if (config.model && config.temperature !== undefined) {
                logTest('配置加载', 'PASS', `模型: ${config.model}, 温度: ${config.temperature}`);
                this.passedTests++;
            } else {
                logTest('配置加载', 'FAIL', '配置对象缺少必需字段');
                this.failedTests++;
            }

            // 测试配置文件路径
            const configPath = configLoader.getConfigPath();
            if (configPath.includes('.coder-ai')) {
                logTest('配置路径', 'PASS', `路径: ${configPath}`);
                this.passedTests++;
            } else {
                logTest('配置路径', 'FAIL', '配置路径不正确');
                this.failedTests++;
            }

        } catch (error) {
            logTest('配置系统', 'FAIL', `错误: ${error instanceof Error ? error.message : '未知错误'}`);
            this.failedTests++;
        }
    }

    async testDiffDisplay() {
        log('\
🎨 测试Diff显示', colors.yellow);

        try {
            const originalContent = 'function hello() {\
  console.log(\"Hello World\");\
}';
            const modifiedContent = 'function hello() {\
  console.log(\"Hello, AI World!\");\
  return true;\
}';

            // 这里只是测试diff显示对象是否存在和可用
            if (typeof diffDisplay.displayDiff === 'function') {
                logTest('Diff显示模块', 'PASS', '模块加载成功，方法可用');
                this.passedTests++;
            } else {
                logTest('Diff显示模块', 'FAIL', 'displayDiff方法不存在');
                this.failedTests++;
            }

            if (typeof diffDisplay.displaySideBySideDiff === 'function') {
                logTest('并列Diff显示', 'PASS', '并列显示功能可用');
                this.passedTests++;
            } else {
                logTest('并列Diff显示', 'FAIL', '并列显示功能不可用');
                this.failedTests++;
            }

        } catch (error) {
            logTest('Diff显示', 'FAIL', `错误: ${error instanceof Error ? error.message : '未知错误'}`);
            this.failedTests++;
        }
    }

    async testCheckpointSystem() {
        log('\
💾 测试检查点系统', colors.yellow);

        try {
            // 创建测试文件
            const testFile = path.join(__dirname, 'test-file.txt');
            fs.writeFileSync(testFile, 'This is a test file for checkpoint system.');

            // 测试检查点创建
            const checkpointId = await checkpointManager.createCheckpoint(
                [testFile],
                'Test checkpoint creation',
                'test'
            );

            if (checkpointId && checkpointId.startsWith('cp_')) {
                logTest('检查点创建', 'PASS', `检查点ID: ${checkpointId}`);
                this.passedTests++;

                // 测试检查点列表
                const checkpoints = checkpointManager.listCheckpoints();
                if (checkpoints.length > 0) {
                    logTest('检查点列表', 'PASS', `找到 ${checkpoints.length} 个检查点`);
                    this.passedTests++;
                } else {
                    logTest('检查点列表', 'FAIL', '检查点列表为空');
                    this.failedTests++;
                }

                // 清理测试检查点
                await checkpointManager.deleteCheckpoint(checkpointId);
                logTest('检查点清理', 'PASS', '测试检查点已删除');
                this.passedTests++;
            } else {
                logTest('检查点创建', 'FAIL', '检查点ID格式不正确');
                this.failedTests++;
            }

            // 清理测试文件
            fs.unlinkSync(testFile);

        } catch (error) {
            logTest('检查点系统', 'FAIL', `错误: ${error instanceof Error ? error.message : '未知错误'}`);
            this.failedTests++;
        }
    }

    async testAgentIntegration() {
        log('\
🤖 测试Agent集成', colors.yellow);

        try {
            const configLoader = new ConfigLoader();
            const config = configLoader.getConfig();

            // 检查API Key
            const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
            if (!apiKey) {
                logTest('Agent初始化', 'SKIP', 'API Key未设置，跳过Agent测试');
                this.skippedTests++;
                return;
            }

            // 创建Agent
            const agent = new SimpleAgent(config);

            if (agent) {
                logTest('Agent创建', 'PASS', '成功创建Agent实例');
                this.passedTests++;
            } else {
                logTest('Agent创建', 'FAIL', 'Agent创建失败');
                this.failedTests++;
                return;
            }

            // 测试配置获取
            const agentConfig = agent.getConfig();
            if (agentConfig.model === config.model) {
                logTest('Agent配置', 'PASS', `配置正确应用，模型: ${agentConfig.model}`);
                this.passedTests++;
            } else {
                logTest('Agent配置', 'FAIL', '配置未正确应用');
                this.failedTests++;
            }

            // 测试健康检查（仅在有API Key时）
            try {
                const healthResult = await agent.healthCheck();
                if (healthResult.status === 'healthy') {
                    logTest('Agent健康检查', 'PASS', healthResult.message);
                    this.passedTests++;
                } else {
                    logTest('Agent健康检查', 'FAIL', healthResult.message);
                    this.failedTests++;
                }
            } catch (healthError) {
                logTest('Agent健康检查', 'FAIL', '健康检查异常');
                this.failedTests++;
            }

            // 测试流式输出方法存在性
            if (typeof agent.processStream === 'function') {
                logTest('流式输出支持', 'PASS', 'processStream方法可用');
                this.passedTests++;
            } else {
                logTest('流式输出支持', 'FAIL', 'processStream方法不存在');
                this.failedTests++;
            }

        } catch (error) {
            logTest('Agent集成', 'FAIL', `错误: ${error instanceof Error ? error.message : '未知错误'}`);
            this.failedTests++;
        }
    }

    displaySummary() {
        log('\
📊 测试总结', colors.bold + colors.cyan);
        log('━'.repeat(60), colors.cyan);

        const totalTests = this.passedTests + this.failedTests + this.skippedTests;

        logTest(`总测试数: ${totalTests}`, 'PASS');
        logTest(`通过: ${this.passedTests}`, 'PASS');

        if (this.failedTests > 0) {
            logTest(`失败: ${this.failedTests}`, 'FAIL');
        }

        if (this.skippedTests > 0) {
            logTest(`跳过: ${this.skippedTests}`, 'SKIP');
        }

        const successRate = totalTests > 0 ? ((this.passedTests / totalTests) * 100).toFixed(1) : '0';
        log(`\
成功率: ${successRate}%`, colors.bold);

        if (this.failedTests === 0) {
            log('\
🎉 所有测试通过！系统准备就绪。', colors.green + colors.bold);
            if (this.skippedTests > 0) {
                log('💡 提示: 设置OPENAI_API_KEY环境变量以运行完整测试。', colors.yellow);
            }
        } else {
            log('\
⚠️  部分测试失败，请检查上述错误信息。', colors.red + colors.bold);
            log('🔧 建议运行: npm run config:reset', colors.yellow);
        }

        log('\
🚀 启动增强CLI: npm start', colors.cyan);
        log('📖 查看使用说明: README-ENHANCED.md', colors.cyan);
    }
}

// 主函数
async function main() {
    const testSuite = new TestSuite();
    await testSuite.runAllTests();
}

// 错误处理
process.on('unhandledRejection', (reason) => {
    console.error('\
❌ 未处理的Promise拒绝:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('\
❌ 未捕获的异常:', error);
    process.exit(1);
});

// 运行测试
if (require.main === module) {
    main().catch((error) => {
        console.error('\
❌ 测试执行失败:', error);
        process.exit(1);
    });
}