#!/usr/bin/env node
/**
 * 测试配置和安全系统
 */

require('ts-node/register');
const { CommandValidator } = require('../src/security/CommandValidator.ts');
const { ConfigLoader } = require('../src/config/ConfigLoader.ts');

async function testConfigurationSystem() {
  console.log('🔧 测试配置和安全系统...\n');
  
  // 测试配置加载
  console.log('1. 测试配置加载:');
  const configLoader = new ConfigLoader();
  const config = configLoader.getConfig();
  
  console.log('✅ 配置已加载');
  console.log(`   模型: ${config.model}`);
  console.log(`   最大令牌数: ${config.maxTokens}`);
  console.log(`   Shell安全配置 - 白名单: ${config.tools.shellExecutor.security.allowlist.join(', ')}`);
  console.log(`   Shell安全配置 - 黑名单: ${config.tools.shellExecutor.security.blocklist.join(', ')}`);
  console.log(`   允许未列出命令: ${config.tools.shellExecutor.security.allowUnlistedCommands}`);
  console.log();
  
  // 测试命令验证器
  console.log('2. 测试命令验证器:');
  const validator = new CommandValidator(configLoader);
  
  // 测试允许的命令
  const testCases = [
    { command: 'git status', expectedAllowed: true, description: '允许的命令' },
    { command: 'npm install', expectedAllowed: true, description: '允许的命令' },
    { command: 'rm -rf /', expectedAllowed: false, description: '危险命令' },
    { command: 'sudo apt update', expectedAllowed: false, description: '黑名单命令' },
    { command: 'echo "hello world"', expectedAllowed: true, description: '白名单命令' },
    { command: 'unknowncommand', expectedAllowed: false, description: '未知命令（取决于配置）' }
  ];
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  testCases.forEach((testCase, index) => {
    const result = validator.validateCommand(testCase.command);
    const passed = result.allowed === testCase.expectedAllowed;
    const status = passed ? '✅' : '❌';
    
    console.log(`   ${status} ${testCase.description}: "${testCase.command}"`);
    console.log(`      结果: ${result.allowed ? '允许' : '拒绝'}`);
    if (!result.allowed && result.reason) {
      console.log(`      原因: ${result.reason}`);
    }
    if (result.suggestion) {
      console.log(`      建议: ${result.suggestion}`);
    }
    
    if (passed) passedTests++;
  });
  
  console.log(`\\n   测试结果: ${passedTests}/${totalTests} 通过`);
  console.log();
  
  // 测试配置验证
  console.log('3. 测试安全配置验证:');
  const configValidation = validator.validateSecurityConfig();
  
  if (configValidation.warnings.length > 0) {
    console.log('   ⚠️ 警告:');
    configValidation.warnings.forEach(warning => {
      console.log(`      - ${warning}`);
    });
  }
  
  if (configValidation.suggestions.length > 0) {
    console.log('   💡 建议:');
    configValidation.suggestions.forEach(suggestion => {
      console.log(`      - ${suggestion}`);
    });
  }
  
  if (configValidation.warnings.length === 0 && configValidation.suggestions.length === 0) {
    console.log('   ✅ 安全配置检查通过');
  }
  
  console.log();
  
  // 测试深度合并
  console.log('4. 测试深度配置合并:');
  const testUpdate = {
    tools: {
      shellExecutor: {
        security: {
          allowlist: ['git', 'npm', 'custom-tool']
        }
      }
    }
  };
  
  try {
    await configLoader.updateConfig(testUpdate);
    const updatedConfig = configLoader.getConfig();
    const newAllowlist = updatedConfig.tools.shellExecutor.security.allowlist;
    
    console.log('   ✅ 配置更新测试通过');
    console.log(`   新的白名单: ${newAllowlist.join(', ')}`);
    console.log(`   其他配置保持不变: 模型=${updatedConfig.model}, 温度=${updatedConfig.temperature}`);
    
    // 恢复默认配置以避免影响后续使用
    configLoader.reloadConfig();
  } catch (error) {
    console.log(`   ❌ 配置更新失败: ${error.message}`);
  }
  
  console.log('\\n🎉 配置和安全系统测试完成!');
}

testConfigurationSystem().catch(console.error);