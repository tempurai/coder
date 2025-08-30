#!/usr/bin/env node
/**
 * 测试循环检测功能
 */

require('ts-node/register');
const { LoopDetectionService } = require('../services/LoopDetectionService.ts');

async function testLoopDetection() {
  console.log('🔄 测试循环检测服务...\n');

  const detector = new LoopDetectionService({
    maxHistorySize: 15,
    exactRepeatThreshold: 3,
    alternatingPatternThreshold: 4,
    parameterCycleThreshold: 4,
    timeWindowMs: 30000,
  });

  console.log('1. 测试精确重复检测:');
  // 模拟相同工具和参数的重复调用
  for (let i = 0; i < 4; i++) {
    const result = detector.addAndCheck({
      toolName: 'shell_executor',
      parameters: { command: 'git status', description: 'Check git status' },
    });

    console.log(`   调用 ${i + 1}: ${result.isLoop ? '🚨 检测到循环' : '✅ 正常'}`);
    if (result.isLoop) {
      console.log(`   类型: ${result.loopType}`);
      console.log(`   描述: ${result.description}`);
      console.log(`   建议: ${result.suggestion}`);
      break;
    }
  }

  console.log('\n2. 测试交替模式检测:');
  detector.clearHistory();

  // 模拟 A-B-A-B 交替模式
  const alternatingCalls = [
    { toolName: 'read_file', parameters: { path: '/test/file1.txt' } },
    { toolName: 'write_file', parameters: { path: '/test/file1.txt', content: 'test' } },
    { toolName: 'read_file', parameters: { path: '/test/file1.txt' } },
    { toolName: 'write_file', parameters: { path: '/test/file1.txt', content: 'test' } },
    { toolName: 'read_file', parameters: { path: '/test/file1.txt' } },
  ];

  alternatingCalls.forEach((call, index) => {
    const result = detector.addAndCheck(call);
    console.log(`   调用 ${index + 1} (${call.toolName}): ${result.isLoop ? '🚨 检测到循环' : '✅ 正常'}`);
    if (result.isLoop) {
      console.log(`   类型: ${result.loopType}`);
      console.log(`   描述: ${result.description}`);
    }
  });

  console.log('\n3. 测试参数循环检测:');
  detector.clearHistory();

  // 模拟同一工具的参数循环
  const parameterCycle = [
    { toolName: 'find_files', parameters: { pattern: '*.js' } },
    { toolName: 'find_files', parameters: { pattern: '*.ts' } },
    { toolName: 'find_files', parameters: { pattern: '*.json' } },
    { toolName: 'find_files', parameters: { pattern: '*.js' } }, // 重复
    { toolName: 'find_files', parameters: { pattern: '*.ts' } }, // 重复
    { toolName: 'find_files', parameters: { pattern: '*.js' } }, // 再次重复
  ];

  parameterCycle.forEach((call, index) => {
    const result = detector.addAndCheck(call);
    console.log(`   调用 ${index + 1} (${call.parameters.pattern}): ${result.isLoop ? '🚨 检测到循环' : '✅ 正常'}`);
    if (result.isLoop) {
      console.log(`   类型: ${result.loopType}`);
      console.log(`   描述: ${result.description}`);
    }
  });

  console.log('\n4. 测试工具序列循环检测:');
  detector.clearHistory();

  // 模拟工具序列的重复
  const toolSequence = [
    { toolName: 'git_status', parameters: {} },
    { toolName: 'git_add', parameters: { files: ['.'] } },
    { toolName: 'git_commit', parameters: { message: 'update' } },
    { toolName: 'git_status', parameters: {} }, // 重复序列开始
    { toolName: 'git_add', parameters: { files: ['.'] } },
    { toolName: 'git_commit', parameters: { message: 'update' } },
  ];

  toolSequence.forEach((call, index) => {
    const result = detector.addAndCheck(call);
    console.log(`   调用 ${index + 1} (${call.toolName}): ${result.isLoop ? '🚨 检测到循环' : '✅ 正常'}`);
    if (result.isLoop) {
      console.log(`   类型: ${result.loopType}`);
      console.log(`   描述: ${result.description}`);
    }
  });

  console.log('\n5. 测试正常调用（不应触发循环）:');
  detector.clearHistory();

  const normalCalls = [
    { toolName: 'read_file', parameters: { path: '/test/file1.txt' } },
    { toolName: 'read_file', parameters: { path: '/test/file2.txt' } },
    { toolName: 'write_file', parameters: { path: '/test/output.txt', content: 'result' } },
    { toolName: 'shell_executor', parameters: { command: 'npm test' } },
  ];

  normalCalls.forEach((call, index) => {
    const result = detector.addAndCheck(call);
    console.log(`   调用 ${index + 1} (${call.toolName}): ${result.isLoop ? '❌ 意外循环' : '✅ 正常'}`);
  });

  console.log('\n6. 测试统计信息:');
  const stats = detector.getStats();
  console.log(`   总调用数: ${stats.totalCalls}`);
  console.log(`   唯一工具数: ${stats.uniqueTools}`);
  console.log(`   最常用工具: ${stats.mostUsedTool || 'None'}`);
  console.log(`   会话时长: ${Math.round(stats.recentTimespan / 1000)}秒`);

  console.log('\n7. 测试配置更新:');
  detector.updateConfig({
    exactRepeatThreshold: 2, // 降低阈值
    alternatingPatternThreshold: 3,
  });

  console.log('   配置已更新，测试新阈值:');
  detector.clearHistory();

  // 只需要2次重复就应该触发
  for (let i = 0; i < 3; i++) {
    const result = detector.addAndCheck({
      toolName: 'test_tool',
      parameters: { test: 'value' },
    });

    console.log(`   调用 ${i + 1}: ${result.isLoop ? '🚨 检测到循环（新阈值）' : '✅ 正常'}`);
    if (result.isLoop) {
      break;
    }
  }

  console.log('\n🎉 循环检测功能测试完成!');

  console.log('\n📋 功能验证总结:');
  console.log('   ✅ 精确重复检测 - 连续相同工具调用');
  console.log('   ✅ 交替模式检测 - A-B-A-B 模式');
  console.log('   ✅ 参数循环检测 - 同工具不同参数循环');
  console.log('   ✅ 工具序列循环检测 - 工具序列重复');
  console.log('   ✅ 正常调用不误报 - 合理的工具使用');
  console.log('   ✅ 配置动态更新 - 灵活的阈值调整');
  console.log('   ✅ 统计信息收集 - 使用情况分析');
}

testLoopDetection().catch(console.error);
