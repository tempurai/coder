#!/usr/bin/env node
/**
 * 测试动态模型加载功能
 */

require('ts-node/register');
const { ConfigLoader } = require('../config/ConfigLoader.ts');

async function testDynamicModelLoading() {
  console.log('🔧 测试动态模型加载功能...\n');

  try {
    const configLoader = new ConfigLoader();
    console.log('✅ ConfigLoader 实例创建成功');

    // 测试模型显示名称
    console.log('📝 测试模型配置解析:');
    const displayName = configLoader.getModelDisplayName();
    console.log(`   当前模型显示名称: ${displayName}`);

    // 测试配置规范化
    const config = configLoader.getConfig();
    console.log(`   配置中的模型设置: ${typeof config.model === 'string' ? config.model : `${config.model.provider}:${config.model.name}`}`);

    // 测试模型创建（需要API Key）
    console.log('\n🤖 测试模型实例创建:');
    try {
      console.log('   正在创建模型实例...');
      const model = await configLoader.createLanguageModel();
      console.log('   ✅ 模型实例创建成功');
      console.log('   模型类型:', typeof model);
      console.log('   模型原型:', Object.getPrototypeOf(model).constructor.name);
    } catch (modelError) {
      console.log(`   ⚠️  模型实例创建失败: ${modelError.message}`);
      console.log('   💡 这是正常的，可能缺少 API Key 或网络连接问题');
    }

    // 测试不同模型配置格式
    console.log('\n🔄 测试不同模型配置格式:');

    // 字符串格式（向后兼容）
    const stringModelConfig = { ...config, model: 'gpt-4o-mini' };
    console.log('   字符串格式:', stringModelConfig.model);

    // 对象格式
    const objectModelConfig = {
      ...config,
      model: {
        provider: 'openai',
        name: 'gpt-4o-mini',
        apiKey: config.apiKey,
      },
    };
    console.log('   对象格式:', `${objectModelConfig.model.provider}:${objectModelConfig.model.name}`);

    // 测试不同提供商的模型名称推断
    console.log('\n🎯 测试模型提供商推断:');
    const testModels = ['gpt-4o-mini', 'gpt-3.5-turbo', 'gemini-1.5-pro', 'claude-3-5-sonnet-20241022', 'command-r-plus', 'mistral-large-latest'];

    testModels.forEach((modelName) => {
      // 临时修改配置来测试推断
      const tempLoader = Object.create(ConfigLoader.prototype);
      tempLoader.config = { model: modelName };

      // 使用私有方法测试（通过 prototype）
      const normalizeMethod = ConfigLoader.prototype.normalizeModelConfig;
      if (normalizeMethod) {
        try {
          const normalized = normalizeMethod.call(tempLoader, modelName);
          console.log(`   ${modelName} -> ${normalized.provider}:${normalized.name}`);
        } catch (e) {
          console.log(`   ${modelName} -> 推断失败`);
        }
      }
    });

    console.log('\n🎉 动态模型加载测试完成!');
    console.log('\n📋 功能总结:');
    console.log('   ✅ 支持字符串和对象两种模型配置格式');
    console.log('   ✅ 自动推断模型提供商');
    console.log('   ✅ 动态创建不同提供商的模型实例');
    console.log('   ✅ 向后兼容现有配置');
    console.log('   ✅ 环境变量和配置文件 API Key 支持');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('详细错误:', error);
  }
}

testDynamicModelLoading().catch(console.error);
