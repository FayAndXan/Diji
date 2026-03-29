import { Queue, Worker } from 'bullmq';
export declare const healthTriggerQueue: Queue<any, any, string, any, any, string>;
export declare const scheduledQueue: Queue<any, any, string, any, any, string>;
export declare const llmQueue: Queue<any, any, string, any, any, string>;
export interface HealthTriggerJob {
    userId: string;
    triggerType: string;
    message: string;
    priority: 'low' | 'medium' | 'high';
    channel: string;
    targetId: string;
}
export interface ScheduledMessageJob {
    userId: string;
    jobType: string;
    channel: string;
    targetId: string;
    timezone: string;
    promptTemplate: string;
}
export interface LlmCallJob {
    userId: string;
    prompt: string;
    channel: string;
    targetId: string;
    model: 'haiku' | 'sonnet' | 'opus';
    sessionKey?: string;
}
export declare function queueHealthTrigger(job: HealthTriggerJob): Promise<void>;
export declare function queueScheduledMessage(job: ScheduledMessageJob, delayMs?: number): Promise<void>;
export declare function queueLlmCall(job: LlmCallJob): Promise<void>;
export declare function startWorkers(handlers: {
    processHealthTrigger: (job: HealthTriggerJob) => Promise<void>;
    processScheduledMessage: (job: ScheduledMessageJob) => Promise<void>;
    processLlmCall: (job: LlmCallJob) => Promise<void>;
}): {
    healthWorker: Worker<any, any, string>;
    scheduledWorker: Worker<any, any, string>;
    llmWorker: Worker<any, any, string>;
};
export declare function runScheduler(pgPool: any): Promise<void>;
export declare function getQueueStats(): Promise<{
    healthTriggers: {
        [index: string]: number;
    };
    scheduledMessages: {
        [index: string]: number;
    };
    llmCalls: {
        [index: string]: number;
    };
}>;
//# sourceMappingURL=jobs.d.ts.map