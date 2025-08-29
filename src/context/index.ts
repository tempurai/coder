/**
 * Context Framework - 上下文感知系统
 * 
 * 这个模块提供了一个灵活、可插拔的上下文框架，允许Agent通过多个
 * 上下文提供者来感知和理解项目环境。
 * 
 * @example
 * ```typescript
 * import { ContextManager, BaseContextProvider, ContextPriority } from './context';
 * 
 * class MyProvider extends BaseContextProvider {
 *   constructor() {
 *     super('my-provider', 'My custom context provider', ContextPriority.HIGH);
 *   }
 * 
 *   async getContext(): Promise<string | null> {
 *     return 'My context information';
 *   }
 * }
 * 
 * const manager = new ContextManager();
 * manager.registerProvider(new MyProvider());
 * const context = await manager.getCombinedContext();
 * ```
 */

// 核心接口和类型
export {
  ContextProvider,
  ExtendedContextProvider,
  ContextPriority,
  BaseContextProvider
} from './ContextProvider';

// 上下文管理器
export { ContextManager } from './ContextManager';

// 未来可扩展的内容：
// export { ProjectStructureProvider } from './providers/ProjectStructureProvider';
// export { GitContextProvider } from './providers/GitContextProvider';
// export { EnvironmentProvider } from './providers/EnvironmentProvider';