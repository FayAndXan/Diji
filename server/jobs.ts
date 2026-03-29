// Diji Job Queue — BullMQ on Redis
// Replaces crontab for scheduled messages + health trigger processing

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// ============================================================
// QUEUES
// ============================================================

// Health triggers: evaluating health data syncs → deciding whether to poke Bryan
export const healthTriggerQueue = new Queue('health-triggers', { connection });

// Scheduled messages: morning check-ins, meal reminders, reports
export const scheduledQueue = new Queue('scheduled-messages', { connection });

// LLM calls: Bryan generating responses for triggers/crons
export const llmQueue = new Queue('llm-calls', { connection });

// ============================================================
// JOB TYPES
// ============================================================

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
  jobType: string; // morning, lunch, evening, daily_report, weekly, monthly
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

// ============================================================
// PRODUCERS (add jobs)
// ============================================================

export async function queueHealthTrigger(job: HealthTriggerJob) {
  const priorityMap = { high: 1, medium: 5, low: 10 };
  await healthTriggerQueue.add('trigger', job, {
    priority: priorityMap[job.priority],
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

export async function queueScheduledMessage(job: ScheduledMessageJob, delayMs?: number) {
  await scheduledQueue.add('scheduled', job, {
    delay: delayMs,
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

export async function queueLlmCall(job: LlmCallJob) {
  const priorityMap = { opus: 1, sonnet: 5, haiku: 10 };
  await llmQueue.add('llm', job, {
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

export function startWorkers(handlers: {
  processHealthTrigger: (job: HealthTriggerJob) => Promise<void>;
  processScheduledMessage: (job: ScheduledMessageJob) => Promise<void>;
  processLlmCall: (job: LlmCallJob) => Promise<void>;
}) {
  const healthWorker = new Worker('health-triggers', async (job: Job) => {
    await handlers.processHealthTrigger(job.data as HealthTriggerJob);
  }, { connection, concurrency: 10 });

  const scheduledWorker = new Worker('scheduled-messages', async (job: Job) => {
    await handlers.processScheduledMessage(job.data as ScheduledMessageJob);
  }, { connection, concurrency: 20 });

  const llmWorker = new Worker('llm-calls', async (job: Job) => {
    await handlers.processLlmCall(job.data as LlmCallJob);
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

export async function runScheduler(pgPool: any) {
  if (!pgPool) return;

  try {
    // Find due jobs
    const { rows: dueJobs } = await pgPool.query(
      `SELECT * FROM scheduled_jobs WHERE enabled = true AND next_run_at <= NOW() ORDER BY next_run_at LIMIT 100`
    );

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
      } else if (job.cron_expression) {
        // Calculate next run from cron expression
        // For now, simple: add the interval based on job type
        const intervals: Record<string, string> = {
          morning_checkin: '1 day',
          lunch_reminder: '1 day',
          evening_checkin: '1 day',
          daily_report: '1 day',
          weekly_report: '7 days',
          monthly_report: '30 days',
        };
        const interval = intervals[job.job_type] || '1 day';
        await pgPool.query(
          `UPDATE scheduled_jobs SET last_run_at = NOW(), next_run_at = NOW() + $2::interval WHERE id = $1`,
          [job.id, interval]
        );
      }
    }

    if (dueJobs.length > 0) {
      console.log(`[Scheduler] Queued ${dueJobs.length} due jobs`);
    }
  } catch (err: any) {
    console.error('[Scheduler] Error:', err.message);
  }
}

// ============================================================
// STATS
// ============================================================

export async function getQueueStats() {
  const [health, scheduled, llm] = await Promise.all([
    healthTriggerQueue.getJobCounts(),
    scheduledQueue.getJobCounts(),
    llmQueue.getJobCounts(),
  ]);
  return { healthTriggers: health, scheduledMessages: scheduled, llmCalls: llm };
}
