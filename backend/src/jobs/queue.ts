import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAMES } from '@verisumm/common';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Setup Redis connection options
let connection: Redis;
try {
  connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
  });
} catch (error) {
  console.error('[Queue] Failed to connect to Redis:', error);
  // Fail-safe mock/stub connection so application doesn't crash
  connection = new Redis({
    lazyConnect: true,
    maxRetriesPerRequest: null,
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
  await summarizationQueue.add('summarize', { jobId });
  console.log(`[Queue] Job ${jobId} enqueued successfully.`);
}
