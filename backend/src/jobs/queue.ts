import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAMES } from '@verisumm/common';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Setup Redis connection options
let connection: Redis;
try {
  connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: process.env.NODE_ENV !== 'test',
  });
} catch (error) {
  console.error('[Queue] Failed to connect to Redis:', error);
  connection = new Redis({
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
}

export const summarizationQueue = new Queue(QUEUE_NAMES.SUMMARIZATION, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
  },
});

export async function enqueueSummarizationJob(jobId: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[Queue] (Test Mode) Enqueue bypassed for job ${jobId}`);
    return;
  }
  try {
    await summarizationQueue.add('summarize', { jobId });
    console.log(`[Queue] Job ${jobId} enqueued successfully.`);
  } catch (err: unknown) {
    console.warn(`[Queue] Failed to enqueue job: ${err instanceof Error ? err.message : String(err)}`);
  }
}
