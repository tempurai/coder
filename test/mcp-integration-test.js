#!/usr/bin/env node

/**
 * 测试 MCP 集成功能
 */

require('ts-node/register');
const { ConfigLoader } = require('../src/config/ConfigLoader.ts');
const { SimpleAgent } = require('../src/agents/SimpleAgent.ts');

async function testMcpIntegration() {
  console.log('🔌 测试 MCP 集成功能...\n');
  
  try {
    // 创建测试配置（无 MCP 服务器）
    const config = {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 4096,
      apiKey: 'test-key',
      mcpServers: {}, // 空的 MCP 服务器配置
      tools: {
        shellExecutor: {
          defaultTimeout: 30000,
          maxRetries: 3,
          allowDangerousCommands: false
        },
        smartDiff: {
          contextLines: 3,
          maxRetries: 3,
          enableFuzzyMatching: true
        }
      }
    };
    
    console.log('1. 创建 SimpleAgent 实例...');
    const agent = new SimpleAgent(config);
    console.log('✅ SimpleAgent 创建成功');
    
    console.log('\n2. 测试异步初始化（无 MCP 服务器）...');
    await agent.initializeAsync();
    console.log('✅ 异步初始化完成');
    
    console.log('\n3. 检查 MCP 状态...');
    const mcpStatus = agent.getMcpStatus();
    console.log('MCP 状态:', mcpStatus);
    console.log(`✅ MCP 工具数量: ${mcpStatus.toolCount}`);
    console.log(`✅ MCP 连接数量: ${mcpStatus.connectionCount}`);
    
    console.log('\n4. 清理资源...');
    await agent.cleanup();
    console.log('✅ 资源清理完成');
    
    console.log('\n🎉 MCP 集成测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error instanceof Error ? error.message : '未知错误');
    console.error(error);
  }
}

testMcpIntegration();