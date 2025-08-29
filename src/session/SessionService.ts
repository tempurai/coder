import { SimpleAgent, AgentStreamEvent } from '../agents/SimpleAgent';
import { FileWatcherService } from '../services/FileWatcherService';
import { Config } from '../config/ConfigLoader';

/**
 * 处理后的用户输入接口
 */
export interface ProcessedInput {
    originalInput: string;
    extractedFilePaths: string[];
    hasFileReferences: boolean;
    timestamp: Date;
    inputLength: number;
    wordCount: number;
}

/**
 * 会话历史项接口
 */
export interface SessionHistoryItem {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: {
        filePaths?: string[];
        duration?: number;
        tokenCount?: number;
    };
}

/**
 * 会话统计信息接口
 */
export interface SessionStats {
    totalInteractions: number;
    totalTokensUsed: number;
    averageResponseTime: number;
    uniqueFilesAccessed: number;
    watchedFilesCount: number;
    sessionDuration: number;
    loopDetectionStats: {
        totalCalls: number;
        uniqueTools: number;
        mostUsedTool: string | null;
        historyLength: number;
    };
    mcpStatus: {
        isLoaded: boolean;
        toolCount: number;
        connectionCount: number;
        tools: string[];
        error?: string;
    };
}

/**
 * 会话管理服务
 * 作为CLI和Agent之间的中介层，处理所有业务逻辑
 */
export class SessionService {
    private agent: SimpleAgent;
    private fileWatcherService: FileWatcherService;
    private config: Config;
    private sessionHistory: SessionHistoryItem[] = [];
    private sessionStartTime: Date;
    private uniqueFilesAccessed: Set<string> = new Set();
    private totalTokensUsed: number = 0;
    private totalResponseTime: number = 0;
    private interactionCount: number = 0;

    constructor(
        agent: SimpleAgent,
        fileWatcherService: FileWatcherService,
        config: Config
    ) {
        this.agent = agent;
        this.fileWatcherService = fileWatcherService;
        this.config = config;
        this.sessionStartTime = new Date();

        console.log('✅ 会话管理服务已初始化');
    }

    /**
     * 处理用户输入，包括文件引用提取和意图解析
     * @param input 原始用户输入
     * @returns 处理后的输入信息
     */
    async processUserInput(input: string): Promise<ProcessedInput> {
        const timestamp = new Date();
        const wordCount = input.split(/\\s+/).filter(word => word.length > 0).length;

        console.log('🔍 正在分析用户输入...');

        // 在新的混合模式下，不再主动提取文件路径
        // Agent将使用其工具动态探索和访问文件
        const extractedFilePaths: string[] = [];
        const hasFileReferences = false;

        // 注意：在混合模式下，我们不再主动提取和监听文件
        // 文件访问将通过Agent工具按需进行
        // if (hasFileReferences) {
        //     console.log(`📄 发现 ${extractedFilePaths.length} 个文件引用: ${extractedFilePaths.join(', ')}`);
        //     extractedFilePaths.forEach(filePath => {
        //         this.uniqueFilesAccessed.add(filePath);
        //     });
        //     await this.manageFileWatching(extractedFilePaths);
        // }

        const processedInput: ProcessedInput = {
            originalInput: input,
            extractedFilePaths,
            hasFileReferences,
            timestamp,
            inputLength: input.length,
            wordCount
        };

        // 添加到会话历史（在混合模式下不包含预提取的文件路径）
        this.addToHistory('user', input);

        return processedInput;
    }

    /**
     * 管理文件监听的添加和移除
     * @param filePaths 需要监听的文件路径数组
     */
    async manageFileWatching(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) {
            try {
                const success = this.fileWatcherService.watchFile(filePath);
                if (success && this.fileWatcherService.isWatching(filePath)) {
                    console.log(`👁️ 开始监听文件变更: ${filePath}`);
                } else {
                    console.warn(`⚠️ 无法监听文件: ${filePath}`);
                }
            } catch (error) {
                console.warn(`⚠️ 文件监听失败 ${filePath}:`, error instanceof Error ? error.message : '未知错误');
            }
        }
    }

    /**
     * 处理Agent流式响应
     * @param query 用户查询
     * @returns Agent响应流
     */
    async *processAgentStream(query: string): AsyncGenerator<AgentStreamEvent, void, unknown> {
        const startTime = Date.now();
        let fullResponse = '';
        let tokenCount = 0;

        try {
            console.log('\
🤔 Processing your request...\
');
            console.log('📝 Response:');

            const stream = this.agent.processStream(query);

            for await (const event of stream) {
                yield event;

                // 收集响应数据用于统计
                if (event.type === 'text-chunk') {
                    fullResponse = event.content;
                    tokenCount = this.estimateTokenCount(fullResponse);
                } else if (event.type === 'tool-call') {
                    console.log(`🔧 使用工具: ${event.toolName}`);
                } else if (event.type === 'tool-result') {
                    console.log(`✓ 工具执行完成: ${event.toolName}`);
                } else if (event.type === 'error') {
                    console.error(`❌ ${event.content}`);
                }
            }

            // 记录完整的助手响应
            if (fullResponse) {
                const duration = Date.now() - startTime;
                this.addToHistory('assistant', fullResponse, {
                    duration,
                    tokenCount
                });

                // 更新统计信息
                this.totalTokensUsed += tokenCount;
                this.totalResponseTime += duration;
                this.interactionCount++;
            }

        } catch (error) {
            const errorMessage = `处理查询时出错: ${error instanceof Error ? error.message : '未知错误'}`;
            console.error(`❌ ${errorMessage}`);
            yield { type: 'error', content: errorMessage };
        }
    }

    /**
     * 获取会话统计信息
     * @returns 会话统计数据
     */
    getSessionStats(): SessionStats {
        const loopStats = this.agent.getLoopDetectionStats();
        const mcpStatus = this.agent.getMcpStatus();
        const sessionDuration = Date.now() - this.sessionStartTime.getTime();

        return {
            totalInteractions: this.interactionCount,
            totalTokensUsed: this.totalTokensUsed,
            averageResponseTime: this.interactionCount > 0
                ? Math.round(this.totalResponseTime / this.interactionCount)
                : 0,
            uniqueFilesAccessed: this.uniqueFilesAccessed.size,
            watchedFilesCount: this.fileWatcherService.getWatchedFiles().length,
            sessionDuration: Math.round(sessionDuration / 1000), // 转换为秒
            loopDetectionStats: {
                totalCalls: loopStats.totalCalls,
                uniqueTools: loopStats.uniqueTools,
                mostUsedTool: loopStats.mostUsedTool,
                historyLength: loopStats.historyLength
            },
            mcpStatus
        };
    }

    /**
     * 获取会话历史记录
     * @param limit 限制返回的历史项数量
     * @returns 会话历史数组
     */
    getSessionHistory(limit?: number): SessionHistoryItem[] {
        const history = limit ? this.sessionHistory.slice(-limit) : this.sessionHistory;
        return history;
    }

    /**
     * 清除会话历史和相关状态
     */
    clearSession(): void {
        this.sessionHistory = [];
        this.uniqueFilesAccessed.clear();
        this.totalTokensUsed = 0;
        this.totalResponseTime = 0;
        this.interactionCount = 0;
        this.sessionStartTime = new Date();

        // 清除Agent的循环检测历史
        this.agent.clearLoopDetectionHistory();

        console.log('✨ 会话历史和状态已清除');
    }

    /**
     * 获取Agent配置信息
     * @returns Agent配置
     */
    getAgentConfig(): Config {
        return this.agent.getConfig();
    }

    /**
     * 检查Agent健康状态
     * @returns 健康检查结果
     */
    async checkAgentHealth(): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> {
        return await this.agent.healthCheck();
    }

    /**
     * 获取文件监听服务状态
     * @returns 文件监听统计信息
     */
    getFileWatcherStats(): {
        watchedFileCount: number;
        recentChangesCount: number;
        totalChangeEvents: number;
    } {
        return {
            watchedFileCount: this.fileWatcherService.getWatchedFiles().length,
            recentChangesCount: this.fileWatcherService.getRecentChangeEvents().length,
            totalChangeEvents: this.fileWatcherService.getRecentChangeEvents().length // 暂时使用相同值
        };
    }

    /**
     * 停止文件监听
     * @param filePath 要停止监听的文件路径
     */
    stopWatchingFile(filePath: string): void {
        this.fileWatcherService.unwatchFile(filePath);
        console.log(`🚫 已停止监听文件: ${filePath}`);
    }

    /**
     * 停止所有文件监听
     */
    stopAllFileWatching(): void {
        // 获取所有监听的文件并逐个停止
        const watchedFiles = this.fileWatcherService.getWatchedFiles();
        for (const filePath of watchedFiles) {
            this.fileWatcherService.unwatchFile(filePath);
        }
        console.log('🚫 已停止所有文件监听');
    }

    /**
     * 清理资源
     */
    async cleanup(): Promise<void> {
        this.stopAllFileWatching();
        await this.agent.cleanup();
        console.log('✅ 会话服务资源已清理');
    }

    /**
     * 添加到会话历史
     * @param role 角色
     * @param content 内容
     * @param metadata 元数据
     */
    private addToHistory(
        role: 'user' | 'assistant',
        content: string,
        metadata?: {
            filePaths?: string[];
            duration?: number;
            tokenCount?: number;
        }
    ): void {
        this.sessionHistory.push({
            role,
            content,
            timestamp: new Date(),
            metadata
        });

        // 保持历史记录在合理范围内
        if (this.sessionHistory.length > 100) {
            this.sessionHistory = this.sessionHistory.slice(-100);
        }
    }

    /**
     * 估算文本的token数量
     * @param text 文本内容
     * @returns 估算的token数量
     */
    private estimateTokenCount(text: string): number {
        // 简单的token估算：大约4个字符 = 1个token
        // 这是一个粗略估算，实际token化会更复杂
        return Math.ceil(text.length / 4);
    }
}