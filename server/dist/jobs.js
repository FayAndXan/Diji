"use strict";
// Diji Job Queue — BullMQ on Redis
// Replaces crontab for scheduled messages + health trigger processing
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmQueue = exports.scheduledQueue = exports.healthTriggerQueue = void 0;
exports.queueHealthTrigger = queueHealthTrigger;
exports.queueScheduledMessage = queueScheduledMessage;
exports.queueLlmCall = queueLlmCall;
exports.startWorkers = startWorkers;
exports.runScheduler = runScheduler;
exports.getQueueStats = getQueueStats;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new ioredis_1.default(REDIS_URL, { maxRetriesPerRequest: null });
// ============================================================
// QUEUES
// ============================================================
// Health triggers: evaluating health data syncs → deciding whether to poke Bryan
exports.healthTriggerQueue = new bullmq_1.Queue('health-triggers', { connection });
// Scheduled messages: morning check-ins, meal reminders, reports
exports.scheduledQueue = new bullmq_1.Queue('scheduled-messages', { connection });
// LLM calls: Bryan generating responses for triggers/crons
exports.llmQueue = new bullmq_1.Queue('llm-calls', { connection });
// ============================================================
// PRODUCERS (add jobs)
// ============================================================
async function queueHealthTrigger(job) {
    const priorityMap = { high: 1, medium: 5, low: 10 };
    await exports.healthTriggerQueue.add('trigger', job, {
        priority: priorityMap[job.priority],
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
    });
}
async function queueScheduledMessage(job, delayMs) {
    await exports.scheduledQueue.add('scheduled', job, {
        delay: delayMs,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 100,
        removeOnFail: 50,
    });
}
async function queueLlmCall(job) {
    const priorityMap = { opus: 1, sonnet: 5, haiku: 10 };
    await exports.llmQueue.add('llm', job, {
        priority: priorityMap[job.model],
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 50,
    });
}
// ============================================================
// WORKERS (process jobs)
// ============================================================
function startWorkers(handlers) {
    const healthWorker = new bullmq_1.Worker('health-triggers', async (job) => {
        await handlers.processHealthTrigger(job.data);
    }, { connection, concurrency: 10 });
    const scheduledWorker = new bullmq_1.Worker('scheduled-messages', async (job) => {
        await handlers.processScheduledMessage(job.data);
    }, { connection, concurrency: 20 });
    const llmWorker = new bullmq_1.Worker('llm-calls', async (job) => {
        await handlers.processLlmCall(job.data);
    }, { connection, concurrency: 5 }); // limit LLM concurrency for cost control
    healthWorker.on('failed', (job, err) => {
        console.error(`[Jobs] Health trigger failed: ${job?.id}`, err.message);
    });
    scheduledWorker.on('failed', (job, err) => {
        console.error(`[Jobs] Scheduled message failed: ${job?.id}`, err.message);
    });
    llmWorker.on('failed', (job, err) => {
        console.error(`[Jobs] LLM call failed: ${job?.id}`, err.message);
    });
    console.log('[Jobs] Workers started: health-triggers(10), scheduled-messages(20), llm-calls(5)');
    return { healthWorker, scheduledWorker, llmWorker };
}
// ============================================================
// SCHEDULER: reads scheduled_jobs from Postgres, queues due jobs
// ============================================================
async function runScheduler(pgPool) {
    if (!pgPool)
        return;
    try {
        // Find due jobs
        const { rows: dueJobs } = await pgPool.query(`SELECT * FROM scheduled_jobs WHERE enabled = true AND next_run_at <= NOW() ORDER BY next_run_at LIMIT 100`);
        for (const job of dueJobs) {
            // Queue the job
            await queueScheduledMessage({
                userId: job.user_id,
                jobType: job.job_type,
                channel: job.channel || 'telegram',
                targetId: job.target_id || '',
                timezone: 'UTC', // resolve from user profile
                promptTemplate: job.payload?.prompt || '',
            });
            // Update or delete the job
            if (job.delete_after_run) {
                await pgPool.query('DELETE FROM scheduled_jobs WHERE id = $1', [job.id]);
            }
            else if (job.cron_expression) {
                // Calculate next run from cron expression
                // For now, simple: add the interval based on job type
                const intervals = {
                    morning_checkin: '1 day',
                    lunch_reminder: '1 day',
                    evening_checkin: '1 day',
                    daily_report: '1 day',
                    weekly_report: '7 days',
                    monthly_report: '30 days',
                };
                const interval = intervals[job.job_type] || '1 day';
                await pgPool.query(`UPDATE scheduled_jobs SET last_run_at = NOW(), next_run_at = NOW() + $2::interval WHERE id = $1`, [job.id, interval]);
            }
        }
        if (dueJobs.length > 0) {
            console.log(`[Scheduler] Queued ${dueJobs.length} due jobs`);
        }
    }
    catch (err) {
        console.error('[Scheduler] Error:', err.message);
    }
}
// ============================================================
// STATS
// ============================================================
async function getQueueStats() {
    const [health, scheduled, llm] = await Promise.all([
        exports.healthTriggerQueue.getJobCounts(),
        exports.scheduledQueue.getJobCounts(),
        exports.llmQueue.getJobCounts(),
    ]);
    return { healthTriggers: health, scheduledMessages: scheduled, llmCalls: llm };
}
//# sourceMappingURL=jobs.js.map