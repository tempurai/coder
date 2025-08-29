/**
 * 确认管理器 - 重构为与Ink UI兼容的版本
 * 不再直接依赖readline，而是通过事件系统与UI组件交互
 */

/**
 * 确认操作类型定义
 */
type ConfirmationAction = 'approve' | 'edit' | 'deny' | 'show-full';

/**
 * 确认选项接口
 */
interface ConfirmationOptions {
  message?: string;
  allowEdit?: boolean;
  defaultAction?: 'approve' | 'deny';
  command?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

/**
 * 确认请求接口
 */
interface ConfirmationRequest {
  id: string;
  type: 'user_confirmation' | 'shell_execution' | 'file_operation';
  options: ConfirmationOptions;
  timestamp: Date;
  resolve: (action: ConfirmationAction) => void;
  reject: (error: Error) => void;
}

/**
 * 编辑请求接口
 */
interface EditRequest {
  id: string;
  prompt: string;
  resolve: (editText: string | null) => void;
  reject: (error: Error) => void;
}

/**
 * 检查点请求接口
 */
interface CheckpointRequest {
  id: string;
  files: string[];
  resolve: (shouldCreate: boolean) => void;
  reject: (error: Error) => void;
}

/**
 * 操作摘要项接口
 */
interface OperationSummaryItem {
  type: string;
  filePath: string;
  additions?: number;
  deletions?: number;
}

/**
 * 操作结果项接口
 */
interface OperationResult {
  success: boolean;
  filePath: string;
  backupPath?: string;
  error?: string;
}

/**
 * 确认管理器事件回调类型
 */
type ConfirmationEventHandler = (request: ConfirmationRequest) => void;
type EditRequestEventHandler = (request: EditRequest) => void;
type CheckpointRequestEventHandler = (request: CheckpointRequest) => void;

/**
 * 增强版确认管理器
 * 支持Ink UI和传统CLI环境
 */
export class ConfirmationManager {
  private pendingConfirmations: Map<string, ConfirmationRequest> = new Map();
  private pendingEdits: Map<string, EditRequest> = new Map();
  private pendingCheckpoints: Map<string, CheckpointRequest> = new Map();
  
  // 事件处理器
  private confirmationHandler: ConfirmationEventHandler | null = null;
  private editRequestHandler: EditRequestEventHandler | null = null;
  private checkpointRequestHandler: CheckpointRequestEventHandler | null = null;

  /**
   * 设置确认事件处理器（用于Ink UI）
   * @param handler 确认事件处理函数
   */
  public setConfirmationHandler(handler: ConfirmationEventHandler): void {
    this.confirmationHandler = handler;
  }

  /**
   * 设置编辑请求事件处理器
   * @param handler 编辑请求事件处理函数
   */
  public setEditRequestHandler(handler: EditRequestEventHandler): void {
    this.editRequestHandler = handler;
  }

  /**
   * 设置检查点请求事件处理器
   * @param handler 检查点请求事件处理函数
   */
  public setCheckpointRequestHandler(handler: CheckpointRequestEventHandler): void {
    this.checkpointRequestHandler = handler;
  }

  /**
   * 获取用户对操作的确认
   * @param options 确认选项
   * @returns Promise<ConfirmationAction> 用户选择的操作
   */
  public async getUserConfirmation(options: ConfirmationOptions = {}): Promise<ConfirmationAction> {
    return new Promise<ConfirmationAction>((resolve, reject) => {
      const id = this.generateId('conf');
      const request: ConfirmationRequest = {
        id,
        type: 'user_confirmation',
        options: {
          message: options.message || 'Apply changes?',
          allowEdit: options.allowEdit !== false,
          defaultAction: options.defaultAction || 'deny',
          command: options.command,
          riskLevel: options.riskLevel || 'medium'
        },
        timestamp: new Date(),
        resolve,
        reject
      };

      this.pendingConfirmations.set(id, request);

      // 如果有UI处理器，通知UI；否则降级到控制台
      if (this.confirmationHandler) {
        this.confirmationHandler(request);
      } else {
        this.handleConfirmationInConsole(request);
      }
    });
  }

  /**
   * 获取用户的编辑请求
   * @param prompt 提示信息
   * @returns Promise<string | null> 编辑内容或null
   */
  public async getEditRequest(prompt: string = 'What changes would you like to make?'): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      const id = this.generateId('edit');
      const request: EditRequest = {
        id,
        prompt,
        resolve,
        reject
      };

      this.pendingEdits.set(id, request);

      // 如果有UI处理器，通知UI；否则降级到控制台
      if (this.editRequestHandler) {
        this.editRequestHandler(request);
      } else {
        this.handleEditRequestInConsole(request);
      }
    });
  }

  /**
   * 询问是否创建检查点
   * @param files 要备份的文件列表
   * @returns Promise<boolean> 是否创建检查点
   */
  public async askForCheckpoint(files: string[]): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const id = this.generateId('checkpoint');
      const request: CheckpointRequest = {
        id,
        files: [...files],
        resolve,
        reject
      };

      this.pendingCheckpoints.set(id, request);

      // 如果有UI处理器，通知UI；否则降级到控制台
      if (this.checkpointRequestHandler) {
        this.checkpointRequestHandler(request);
      } else {
        this.handleCheckpointRequestInConsole(request);
      }
    });
  }

  /**
   * 解析确认请求（由UI调用）
   * @param id 请求ID
   * @param action 用户选择的操作
   */
  public resolveConfirmation(id: string, action: ConfirmationAction): void {
    const request = this.pendingConfirmations.get(id);
    if (request) {
      this.pendingConfirmations.delete(id);
      request.resolve(action);
    }
  }

  /**
   * 解析编辑请求（由UI调用）
   * @param id 请求ID
   * @param editText 编辑内容
   */
  public resolveEditRequest(id: string, editText: string | null): void {
    const request = this.pendingEdits.get(id);
    if (request) {
      this.pendingEdits.delete(id);
      request.resolve(editText);
    }
  }

  /**
   * 解析检查点请求（由UI调用）
   * @param id 请求ID
   * @param shouldCreate 是否创建检查点
   */
  public resolveCheckpointRequest(id: string, shouldCreate: boolean): void {
    const request = this.pendingCheckpoints.get(id);
    if (request) {
      this.pendingCheckpoints.delete(id);
      request.resolve(shouldCreate);
    }
  }

  /**
   * 取消所有待处理的请求
   */
  public cancelAllRequests(): void {
    const error = new Error('Request cancelled');
    
    this.pendingConfirmations.forEach(request => request.reject(error));
    this.pendingEdits.forEach(request => request.reject(error));
    this.pendingCheckpoints.forEach(request => request.reject(error));
    
    this.pendingConfirmations.clear();
    this.pendingEdits.clear();
    this.pendingCheckpoints.clear();
  }

  /**
   * 显示操作摘要
   * @param operations 操作列表
   */
  public displayOperationSummary(operations: OperationSummaryItem[]): void {
    console.log('\\n📋 Planned operations:');
    console.log('━'.repeat(50));
    
    operations.forEach((op, index) => {
      const icon = op.type === 'diff' ? '📝' : '📄';
      const changes = (op.additions !== undefined && op.deletions !== undefined)
        ? ` (+${op.additions} -${op.deletions})`
        : '';
      
      console.log(`${index + 1}. ${icon} ${op.type.toUpperCase()}: ${op.filePath}${changes}`);
    });
    
    console.log('━'.repeat(50));
  }

  /**
   * 显示成功摘要
   * @param results 操作结果列表
   */
  public displaySuccessSummary(results: OperationResult[]): void {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log('\\n✅ Operation Summary:');
    console.log('━'.repeat(50));
    
    if (successful.length > 0) {
      console.log(`✅ Successfully modified ${successful.length} file(s):`);
      successful.forEach(result => {
        const backup = result.backupPath ? ` (backup: ${result.backupPath})` : '';
        console.log(`   📄 ${result.filePath}${backup}`);
      });
    }
    
    if (failed.length > 0) {
      console.log(`\\n❌ Failed to modify ${failed.length} file(s):`);
      failed.forEach(result => {
        console.log(`   📄 ${result.filePath}: ${result.error}`);
      });
    }
    
    console.log('━'.repeat(50));
  }

  /**
   * 生成唯一ID
   * @param prefix ID前缀
   * @returns 唯一ID字符串
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 控制台模式确认处理（降级选项）
   * @param request 确认请求
   */
  private handleConfirmationInConsole(request: ConfirmationRequest): void {
    const { options } = request;
    let promptText = `\\n❓ ${options.message} `;
    
    if (options.command) {
      console.log(`\\n🔧 Command to execute: ${options.command}`);
      const riskColor = options.riskLevel === 'high' ? '🔴' : 
                       options.riskLevel === 'medium' ? '🟡' : '🟢';
      console.log(`${riskColor} Risk Level: ${options.riskLevel?.toUpperCase()}`);
    }
    
    if (options.allowEdit) {
      promptText += '(a)pprove, (e)dit, (s)how-full, (d)eny: ';
    } else {
      promptText += '(a)pprove, (s)how-full, (d)eny: ';
    }

    // 简化的控制台输入（在真实环境中应该使用readline）
    console.log(promptText);
    console.log('⚠️ Console mode: Defaulting to deny for safety');
    request.resolve('deny');
  }

  /**
   * 控制台模式编辑请求处理（降级选项）
   * @param request 编辑请求
   */
  private handleEditRequestInConsole(request: EditRequest): void {
    console.log(`\\n📝 ${request.prompt}`);
    console.log('⚠️ Console mode: Edit request cancelled');
    request.resolve(null);
  }

  /**
   * 控制台模式检查点请求处理（降级选项）
   * @param request 检查点请求
   */
  private handleCheckpointRequestInConsole(request: CheckpointRequest): void {
    const fileList = request.files.length <= 3 
      ? request.files.join(', ') 
      : `${request.files.slice(0, 3).join(', ')} and ${request.files.length - 3} more`;
    
    console.log(`\\n💾 Create checkpoint before modifying ${fileList}?`);
    console.log('⚠️ Console mode: Defaulting to create checkpoint for safety');
    request.resolve(true);
  }
}

/**
 * 待处理操作数据接口
 */
interface PendingOperationData {
  filePath?: string;
  additions?: number;
  deletions?: number;
  content?: string;
  [key: string]: unknown;
}

/**
 * 待处理操作接口
 */
interface PendingOperation {
  id: string;
  type: 'file_write';
  data: PendingOperationData;
  preview?: string;
}

/**
 * 待处理操作摘要接口
 */
interface PendingOperationSummary {
  id: string;
  type: string;
  filePath: string;
  additions?: number;
  deletions?: number;
}

/**
 * 待处理操作管理器
 * 管理需要用户确认的操作队列
 */
export class PendingOperationsManager {
  private operations: PendingOperation[] = [];
  
  /**
   * 添加待处理操作
   * @param type 操作类型
   * @param data 操作数据
   * @param preview 预览内容
   * @returns 操作ID
   */
  public addOperation(type: 'file_write', data: PendingOperationData, preview?: string): string {
    const id = `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.operations.push({ id, type, data, preview });
    return id;
  }
  
  /**
   * 获取所有待处理操作
   * @returns 待处理操作列表的副本
   */
  public getOperations(): PendingOperation[] {
    return [...this.operations];
  }
  
  /**
   * 移除指定操作
   * @param id 操作ID
   */
  public removeOperation(id: string): void {
    this.operations = this.operations.filter(op => op.id !== id);
  }
  
  /**
   * 清空所有操作
   */
  public clearOperations(): void {
    this.operations = [];
  }
  
  /**
   * 检查是否有待处理操作
   * @returns 是否有待处理操作
   */
  public hasPendingOperations(): boolean {
    return this.operations.length > 0;
  }
  
  /**
   * 获取操作摘要
   * @returns 操作摘要列表
   */
  public getOperationsSummary(): PendingOperationSummary[] {
    return this.operations.map(op => ({
      id: op.id,
      type: op.type,
      filePath: op.data.filePath || 'unknown',
      additions: op.data.additions,
      deletions: op.data.deletions
    }));
  }
}

/**
 * 全局确认管理器实例（单例模式）
 */
export const globalConfirmationManager = new ConfirmationManager();