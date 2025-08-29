#!/usr/bin/env node

/**
 * 测试 Web 工具功能
 */

// 使用 ts-node 运行，这样可以直接导入 TypeScript 源码
require('ts-node/register');
const { webSearchTool, urlFetchTool } = require('../src/tools/WebTools.ts');

async function testWebTools() {
  console.log('🌐 测试 Web 工具功能...\n');
  
  // 测试 URL 安全检查
  console.log('1. 测试 URL 安全检查:');
  const unsafeResult = await urlFetchTool.execute({ url: 'http://localhost:3000' });
  console.log('本地地址测试:', unsafeResult.success ? '❌ 应该失败' : '✅ 正确阻止');
  console.log('错误信息:', unsafeResult.error);
  console.log();
  
  // 测试安全 URL 获取（使用一个简单的 HTML 页面）
  console.log('2. 测试安全 URL 获取:');
  const safeResult = await urlFetchTool.execute({ url: 'https://example.com' });
  console.log('安全URL测试:', safeResult.success ? '✅ 成功' : '❌ 失败');
  if (safeResult.success) {
    console.log('内容长度:', safeResult.content.length);
    console.log('是否截断:', safeResult.truncated);
    console.log('标题:', safeResult.title || '未找到');
  } else {
    console.log('错误:', safeResult.error);
  }
  console.log();
  
  // 测试无效配置的 web 搜索
  console.log('3. 测试未配置 API Key 的搜索:');
  const searchResult = await webSearchTool.execute({ query: 'TypeScript best practices' });
  console.log('未配置搜索:', searchResult.success ? '❌ 不应成功' : '✅ 正确失败');
  console.log('错误信息:', searchResult.error);
}

testWebTools().catch(console.error);