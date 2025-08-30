/**
 * 模型相关的类型、接口和工厂
 * 提供统一的模型创建和管理接口
 */

// 导出主要类型
export type { ModelProvider, ModelConfig } from './ModelFactory.js';

// 导出默认模型工厂
export { DefaultModelFactory } from './ModelFactory.js';

// 便捷的默认导出
export { DefaultModelFactory as ModelFactory } from './ModelFactory.js';