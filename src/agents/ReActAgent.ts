import * as fs from 'fs';
import * as path from 'path';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types.js';
import { SimpleAgent } from './SimpleAgent.js';
import { UIEventEmitter } from '../events/UIEventEmitter.js';
import {
  UIEventType,
  ReActIterationStartedEvent,
  ThoughtGeneratedEvent,
  PlanUpdatedEvent,
  ActionSelectedEvent,
  ToolCallStartedEvent,
  ToolCallCompletedEvent,
  ObservationMadeEvent
} from '../events/EventTypes.js';
import { ErrorHandler, ErrorCode } from '../errors/ErrorHandler.js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

/**
 * ReAct循环的单次迭代状态
 */
interface ReActIteration {
  /** 迭代序号 */
  iteration: number;
  /** 观察结果（上一次工具执行的结果） */
  observation: string;
  /** Agent的思考内容 */
  thought: string;
  /** 当前计划内容 */
  plan: string;
  /** 执行的动作 */
  action: {
    tool: string;
    args: any;
    result?: any;
    error?: string;
  };
  /** 是否完成 */
  finished: boolean;
}

/**
 * 任务执行结果
 */
interface TaskResult {
  /** 执行是否成功 */
  success: boolean;
  /** 任务描述 */
  taskDescription: string;
  /** 最终总结 */
  summary: string;
  /** 执行的迭代次数 */
  iterations: number;
  /** 任务执行时间（毫秒） */
  duration: number;
  /** 错误信息（如果失败） */
  error?: string;
  /** 所有迭代记录 */
  history: ReActIteration[];
}

/**
 * ReActAgent - 真正的ReAct循环驱动者
 * 
 * 这是新的顶层Agent，负责：
 * 1. 管理任务生命周期和状态持久化
 * 2. 实现真正的ReAct推理循环
 * 3. 将SimpleAgent作为工具执行能力层
 * 
 * 与传统的线性工作流不同，ReActAgent允许LLM动态决定：
 * - 跳过某些步骤
 * - 重复某些步骤  
 * - 根据情况调整计划
 * - 在任何时候决定任务完成
 */
@injectable()
export class ReActAgent {
  private projectRoot: string;
  private statusDir: string;
  private planFilePath: string;
  private maxIterations: number;

  constructor(
    @inject(TYPES.SimpleAgent) private simpleAgent: SimpleAgent,
    @inject(TYPES.UIEventEmitter) private eventEmitter: UIEventEmitter,
    maxIterations: number = 20
  ) {
    this.maxIterations = maxIterations;

    // 设置项目目录和状态文件路径
    this.projectRoot = process.cwd();
    this.statusDir = path.join(this.projectRoot, '.tempurai');
    this.planFilePath = path.join(this.statusDir, 'plan.xml');
  }

  /**
   * 运行任务的核心方法
   * 实现真正的ReAct循环：Reason -> Act -> Observe
   * 
   * @param initialQuery 初始用户查询
   * @returns 任务执行结果
   */
  async runTask(initialQuery: string): Promise<TaskResult> {
    const startTime = Date.now();
    const history: ReActIteration[] = [];

    console.log(`🚀 Starting ReAct task: ${initialQuery.substring(0, 60)}...`);

    try {
      // 准备环境：确保.tempurai目录存在并初始化plan.xml
      await this.prepareEnvironment(initialQuery);

      let iteration = 0;
      let currentObservation = `Initial task: ${initialQuery}`;
      let finished = false;

      // ReAct循环：继续直到Agent决定完成或达到最大迭代次数
      while (!finished && iteration < this.maxIterations) {
        iteration++;
        console.log(`\n🔄 ReAct Iteration ${iteration}/${this.maxIterations}`);

        // 发射迭代开始事件
        this.eventEmitter.emit<ReActIterationStartedEvent>({
          type: UIEventType.ReActIteration,
          iteration,
          maxIterations: this.maxIterations,
          observation: currentObservation,
        });

        try {
          // 构建ReAct提示词
          const reactPrompt = await this.buildReActPrompt(currentObservation, history);

          // 调用SimpleAgent的LLM进行推理
          const response = await this.simpleAgent.generateResponse(reactPrompt);

          // 解析XML响应
          const parsedResponse = this.parseReActResponse(response);

          if (!parsedResponse) {
            const error = ErrorHandler.standardize(
              new Error('Failed to parse Agent response as valid ReAct XML'),
              ErrorCode.XML_PARSING_FAILED
            );
            console.error(`❌ ${error.error} - ${error.recoveryHint}`);

            // 尝试提供更好的错误反馈给下次迭代
            currentObservation = `Previous response could not be parsed as valid XML. Please ensure your response follows the exact XML format specified in the instructions.`;
            continue;
          }

          // 发射思考生成事件
          this.eventEmitter.emit<ThoughtGeneratedEvent>({
            type: UIEventType.ThoughtGenerated,
            iteration,
            thought: parsedResponse.thought,
            context: currentObservation,
          });

          // 更新计划文件
          await this.updatePlanFile(parsedResponse.plan);

          // 发射计划更新事件
          this.eventEmitter.emit<PlanUpdatedEvent>({
            type: UIEventType.PlanUpdated,
            iteration,
            plan: parsedResponse.plan,
            status: finished ? 'completed' : 'in_progress',
          });

          // 发射动作选择事件
          this.eventEmitter.emit<ActionSelectedEvent>({
            type: UIEventType.ActionSelected,
            iteration,
            tool: parsedResponse.action.tool,
            args: parsedResponse.action.args,
            reasoning: parsedResponse.thought,
          });

          // 检查是否完成
          if (parsedResponse.action.tool === 'finish') {
            finished = true;
            console.log('✅ Task completed by Agent decision');
          }

          // 记录当前迭代
          const currentIteration: ReActIteration = {
            iteration,
            observation: currentObservation,
            thought: parsedResponse.thought,
            plan: parsedResponse.plan,
            action: {
              tool: parsedResponse.action.tool,
              args: parsedResponse.action.args
            },
            finished
          };

          // 执行动作（如果不是finish）
          if (!finished) {
            console.log(`🔧 Executing tool: ${parsedResponse.action.tool}`);

            // 发射工具调用开始事件
            this.eventEmitter.emit<ToolCallStartedEvent>({
              type: UIEventType.ToolCallStarted,
              iteration,
              toolName: parsedResponse.action.tool,
              args: parsedResponse.action.args,
              description: `Executing ${parsedResponse.action.tool}`,
            });

            try {
              const toolStartTime = Date.now();
              const toolResult = await this.simpleAgent.executeTool(
                parsedResponse.action.tool,
                parsedResponse.action.args
              );
              const toolDuration = Date.now() - toolStartTime;

              currentIteration.action.result = toolResult;
              currentObservation = `Tool '${parsedResponse.action.tool}' executed. Result: ${JSON.stringify(toolResult, null, 2)}`;

              // 发射工具调用完成事件
              this.eventEmitter.emit<ToolCallCompletedEvent>({
                type: UIEventType.ToolCallCompleted,
                iteration,
                toolName: parsedResponse.action.tool,
                success: true,
                result: toolResult,
                duration: toolDuration,
              });

            } catch (toolError) {
              const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown tool error';
              currentIteration.action.error = errorMessage;
              currentObservation = `Tool '${parsedResponse.action.tool}' failed: ${errorMessage}`;
              console.error(`❌ Tool execution failed: ${errorMessage}`);

              // 发射工具调用失败事件
              this.eventEmitter.emit<ToolCallCompletedEvent>({
                type: UIEventType.ToolCallCompleted,
                iteration,
                toolName: parsedResponse.action.tool,
                success: false,
                error: errorMessage,
                duration: 0,
              });
            }
          } else {
            currentIteration.action.result = 'Task finished';
            currentObservation = 'Task completed successfully';
          }

          // 发射观察事件
          this.eventEmitter.emit<ObservationMadeEvent>({
            type: UIEventType.ObservationMade,
            iteration,
            observation: currentObservation,
            analysis: finished ? 'Task completed successfully' : undefined,
          });

          history.push(currentIteration);

        } catch (iterationError) {
          const errorMessage = iterationError instanceof Error ? iterationError.message : 'Unknown iteration error';
          console.error(`❌ Iteration ${iteration} failed: ${errorMessage}`);

          // 记录失败的迭代
          history.push({
            iteration,
            observation: currentObservation,
            thought: 'Error occurred during iteration',
            plan: 'N/A',
            action: { tool: 'error', args: {}, error: errorMessage },
            finished: true
          });

          // 如果单次迭代失败，我们继续尝试，但更新观察结果
          currentObservation = `Previous iteration failed: ${errorMessage}. Please adjust your approach.`;

          // 如果连续多次失败，终止任务
          const recentErrors = history.slice(-3).filter(h => h.action.error).length;
          if (recentErrors >= 3) {
            console.error('❌ Too many consecutive errors, terminating task');
            break;
          }
        }
      }

      // 生成最终结果
      const duration = Date.now() - startTime;
      const success = finished || history.some(h => h.finished && !h.action.error);

      const result: TaskResult = {
        success,
        taskDescription: initialQuery,
        summary: this.generateTaskSummary(history, success),
        iterations: iteration,
        duration,
        history
      };

      if (!success) {
        result.error = iteration >= this.maxIterations
          ? 'Maximum iterations reached'
          : 'Task failed due to errors';
      }

      console.log(`\n📊 Task completed: ${success ? 'Success' : 'Failed'} in ${iteration} iterations (${duration}ms)`);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`💥 ReAct task failed: ${errorMessage}`);

      return {
        success: false,
        taskDescription: initialQuery,
        summary: `Task failed: ${errorMessage}`,
        iterations: history.length,
        duration,
        error: errorMessage,
        history
      };
    }
  }

  /**
   * 准备任务执行环境
   * 确保.tempurai目录存在，初始化或清空plan.xml
   */
  private async prepareEnvironment(initialQuery: string): Promise<void> {
    try {
      // 确保状态目录存在
      await fs.promises.mkdir(this.statusDir, { recursive: true });

      // 初始化计划文件
      const initialPlan = `<?xml version="1.0" encoding="UTF-8"?>
<plan>
  <task>${initialQuery}</task>
  <status>started</status>
  <created>${new Date().toISOString()}</created>
  <steps>
    <step>Analyze the task requirements</step>
    <step>Plan the implementation approach</step>  
    <step>Execute the necessary changes</step>
    <step>Validate and test the results</step>
  </steps>
</plan>`;

      await fs.promises.writeFile(this.planFilePath, initialPlan, 'utf8');
      console.log(`📋 Initialized plan file: ${this.planFilePath}`);

    } catch (error) {
      throw new Error(`Failed to prepare environment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 构建ReAct提示词
   * 包含观察结果、历史记录和当前计划
   */
  private async buildReActPrompt(observation: string, history: ReActIteration[]): Promise<string> {
    // 读取当前计划
    let currentPlan = '';
    try {
      if (fs.existsSync(this.planFilePath)) {
        currentPlan = await fs.promises.readFile(this.planFilePath, 'utf8');
      }
    } catch (error) {
      currentPlan = '<plan>No current plan available</plan>';
    }

    // 构建历史摘要
    const historyText = history.length > 0
      ? history.slice(-3).map(h => `Iteration ${h.iteration}: ${h.thought} -> ${h.action.tool}(${JSON.stringify(h.action.args)}) -> ${h.action.result || h.action.error || 'No result'}`).join('\n')
      : 'No previous iterations';

    return `You are operating in ReAct mode. Based on the current observation and your plan, decide what to do next.

OBSERVATION:
${observation}

CURRENT PLAN:
${currentPlan}

RECENT HISTORY:
${historyText}

INSTRUCTIONS:
1. Think about what you've observed and what needs to be done next
2. Update your plan if needed based on new information
3. Choose the next action to take

Your response must be in this EXACT XML format:

<response>
  <thought>
    Your reasoning about the current situation and what to do next
  </thought>
  <plan>
    <?xml version="1.0" encoding="UTF-8"?>
    <plan>
      <task>Original task description</task>
      <status>current status (planning|in-progress|testing|completed)</status>
      <updated>${new Date().toISOString()}</updated>
      <steps>
        <step priority="high">Most important next step</step>
        <step>Second step</step>
        <step>Additional steps as needed</step>
      </steps>
      <notes>Any important notes or observations</notes>
    </plan>
  </plan>
  <action>
    <tool>tool_name</tool>
    <args>{"key": "value"}</args>
  </action>
</response>

AVAILABLE TOOLS:
- read_file: Read file contents
- write_file: Write content to file  
- amend_file: Make targeted changes to existing file
- analyze_code_structure: Analyze code with AST parsing
- find_files: Find files matching patterns
- search_in_files: Search for text in files
- shell_executor: Execute shell commands
- web_search: Search the internet
- git_status: Check git status
- git_diff: Show git differences
- finish: Complete the task (use when done)

Use "finish" as the tool when the task is completed successfully.`;
  }

  /**
   * 解析Agent的XML响应 - 使用健壮的XML解析器
   */
  private parseReActResponse(response: string): {
    thought: string;
    plan: string;
    action: { tool: string; args: any };
  } | null {
    try {
      // 1. 首先清理和准备XML内容
      const cleanedResponse = this.cleanXmlResponse(response);

      // 2. 验证XML格式
      const validationResult = XMLValidator.validate(cleanedResponse);
      if (validationResult !== true) {
        console.error('XML validation failed:', validationResult.err);
        return this.parseWithFallbackRegex(response);
      }

      // 3. 使用XML解析器
      const parser = new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
        parseTagValue: false,
        parseAttributeValue: false
      });

      const parsed = parser.parse(cleanedResponse);

      // 4. 验证必需的元素
      if (!parsed.response) {
        console.error('Missing root <response> element');
        return this.parseWithFallbackRegex(response);
      }

      const { response: reactResponse } = parsed;

      if (!reactResponse.thought || !reactResponse.plan || !reactResponse.action) {
        console.error('Missing required elements: thought, plan, or action');
        return this.parseWithFallbackRegex(response);
      }

      // 5. 解析action参数
      let actionArgs = {};
      if (reactResponse.action.args) {
        try {
          if (typeof reactResponse.action.args === 'string') {
            actionArgs = JSON.parse(reactResponse.action.args);
          } else {
            actionArgs = reactResponse.action.args;
          }
        } catch (jsonError) {
          console.warn('Failed to parse action args as JSON, using as-is');
          actionArgs = reactResponse.action.args || {};
        }
      }

      // 6. 提取并清理plan内容
      let planContent = '';
      if (typeof reactResponse.plan === 'string') {
        planContent = reactResponse.plan.trim();
      } else {
        // plan包含嵌套XML，需要重新序列化
        planContent = this.serializePlanXml(reactResponse.plan);
      }

      return {
        thought: String(reactResponse.thought).trim(),
        plan: planContent,
        action: {
          tool: String(reactResponse.action.tool).trim(),
          args: actionArgs
        }
      };

    } catch (error) {
      ErrorHandler.logError(error, { context: 'parseReActResponse', responseLength: response.length });
      console.error(`XML parsing failed, attempting regex fallback`);
      return this.parseWithFallbackRegex(response);
    }
  }

  /**
   * 清理XML响应，处理常见的格式问题
   */
  private cleanXmlResponse(response: string): string {
    let cleaned = response.trim();

    // 移除代码块标记
    cleaned = cleaned.replace(/```xml\s*/, '').replace(/```\s*$/, '');

    // 如果没有根元素，尝试查找response标签
    if (!cleaned.includes('<response>')) {
      const responseMatch = cleaned.match(/<response[\s\S]*<\/response>/);
      if (responseMatch) {
        cleaned = responseMatch[0];
      } else {
        throw new Error('No valid response XML structure found');
      }
    }

    // 确保XML声明存在（如果需要）
    if (!cleaned.startsWith('<?xml') && !cleaned.startsWith('<response>')) {
      cleaned = `<?xml version="1.0" encoding="UTF-8"?>\n${cleaned}`;
    }

    return cleaned;
  }

  /**
   * 序列化plan XML对象回字符串
   */
  private serializePlanXml(planObj: any): string {
    try {
      // 简单的XML序列化
      if (typeof planObj === 'string') {
        return planObj;
      }

      if (planObj.plan) {
        const plan = planObj.plan;
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<plan>\n';

        if (plan.task) xml += `  <task>${plan.task}</task>\n`;
        if (plan.status) xml += `  <status>${plan.status}</status>\n`;
        if (plan.updated) xml += `  <updated>${plan.updated}</updated>\n`;

        if (plan.steps) {
          xml += '  <steps>\n';
          if (Array.isArray(plan.steps.step)) {
            for (const step of plan.steps.step) {
              const priority = step['@_priority'] ? ` priority="${step['@_priority']}"` : '';
              xml += `    <step${priority}>${step['#text'] || step}</step>\n`;
            }
          } else if (plan.steps.step) {
            const step = plan.steps.step;
            const priority = step['@_priority'] ? ` priority="${step['@_priority']}"` : '';
            xml += `    <step${priority}>${step['#text'] || step}</step>\n`;
          }
          xml += '  </steps>\n';
        }

        if (plan.notes) xml += `  <notes>${plan.notes}</notes>\n`;
        xml += '</plan>';

        return xml;
      }

      return JSON.stringify(planObj);
    } catch (error) {
      console.warn('Failed to serialize plan XML:', error);
      return String(planObj);
    }
  }

  /**
   * 回退的正则表达式解析（当XML解析失败时）
   */
  private parseWithFallbackRegex(response: string): {
    thought: string;
    plan: string;
    action: { tool: string; args: any };
  } | null {
    try {
      console.log('Using regex fallback for XML parsing');

      // 使用更宽松的正则表达式
      const thoughtMatch = response.match(/<thought[^>]*>([\s\S]*?)<\/thought>/);
      const planMatch = response.match(/<plan[^>]*>([\s\S]*?)<\/plan>/);
      const toolMatch = response.match(/<tool[^>]*>([^<]+)<\/tool>/);
      const argsMatch = response.match(/<args[^>]*>([\s\S]*?)<\/args>/);

      if (!thoughtMatch || !planMatch || !toolMatch) {
        console.error('Regex fallback also failed to parse required elements');
        return null;
      }

      let args = {};
      if (argsMatch && argsMatch[1].trim()) {
        try {
          args = JSON.parse(argsMatch[1].trim());
        } catch (jsonError) {
          console.warn('Failed to parse args JSON in fallback, using empty object');
        }
      }

      return {
        thought: thoughtMatch[1].trim(),
        plan: planMatch[1].trim(),
        action: {
          tool: toolMatch[1].trim(),
          args
        }
      };

    } catch (error) {
      ErrorHandler.logError(error, { context: 'parseWithFallbackRegex' });
      return null;
    }
  }

  /**
   * 更新计划文件
   */
  private async updatePlanFile(planContent: string): Promise<void> {
    try {
      await fs.promises.writeFile(this.planFilePath, planContent, 'utf8');
    } catch (error) {
      console.warn(`Failed to update plan file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 生成任务总结
   */
  private generateTaskSummary(history: ReActIteration[], success: boolean): string {
    if (history.length === 0) {
      return 'No iterations completed';
    }

    const lastIteration = history[history.length - 1];
    const toolsUsed = [...new Set(history.map(h => h.action.tool))];
    const errors = history.filter(h => h.action.error).length;

    return [
      `Task ${success ? 'completed successfully' : 'failed'} after ${history.length} iterations.`,
      `Tools used: ${toolsUsed.join(', ')}`,
      errors > 0 ? `Encountered ${errors} errors during execution.` : 'No errors encountered.',
      `Final status: ${lastIteration.thought}`
    ].join(' ');
  }

  /**
   * 获取当前计划状态
   */
  async getCurrentPlan(): Promise<string | null> {
    try {
      if (fs.existsSync(this.planFilePath)) {
        return await fs.promises.readFile(this.planFilePath, 'utf8');
      }
      return null;
    } catch (error) {
      console.warn(`Failed to read current plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * 清理状态文件
   */
  async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.planFilePath)) {
        await fs.promises.unlink(this.planFilePath);
        console.log('🧹 Cleaned up plan file');
      }
    } catch (error) {
      console.warn(`Failed to cleanup plan file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}