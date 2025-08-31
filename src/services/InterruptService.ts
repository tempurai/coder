import { injectable } from 'inversify';

@injectable()
export class InterruptService {
    private interrupted = false;
    private abortController: AbortController | null = null;

    // 开始新任务时创建新的AbortController
    startTask(): void {
        this.interrupted = false;
        this.abortController = new AbortController();
    }

    // 中断当前任务
    interrupt(): void {
        this.interrupted = true;
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    isInterrupted(): boolean {
        return this.interrupted;
    }

    // 获取当前的AbortSignal，供AI SDK和其他操作使用
    getAbortSignal(): AbortSignal | undefined {
        return this.abortController?.signal;
    }

    // 检查AbortSignal是否已被中断
    isAborted(): boolean {
        return this.abortController?.signal.aborted ?? false;
    }

    reset(): void {
        this.interrupted = false;
        this.abortController = null;
    }
}