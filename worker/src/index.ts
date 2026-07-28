import dotenv from 'dotenv';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAMES } from '@verisumm/common';
import { connectDB } from '../../backend/src/lib/db.js';
import { processSummarizationJob } from './processor.js';

dotenv.config();

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/verisumm';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(`[Worker] VeriSumm BullMQ Worker initialized.`);
console.log(`[Worker] Listening on queue: ${QUEUE_NAMES.SUMMARIZATION}`);

// Connect to MongoDB
connectDB(mongoUri)
  .then(() => console.log('[Worker] Connected to MongoDB'))
  .catch((err) => console.error('[Worker] MongoDB connection error:', err));

// Setup Redis connection options
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Initialize BullMQ Worker
const worker = new Worker(
  QUEUE_NAMES.SUMMARIZATION,
  async (bullJob: Job) => {
    const { jobId } = bullJob.data;
    return processSummarizationJob(jobId);
  },
  { connection },
);

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job failed: ${job?.id} - ${err.message}`);
});
