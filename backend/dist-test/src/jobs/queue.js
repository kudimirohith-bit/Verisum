"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizationQueue = void 0;
exports.enqueueSummarizationJob = enqueueSummarizationJob;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const common_1 = require("@verisumm/common");
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
// Setup Redis connection options
let connection;
try {
    connection = new ioredis_1.default(redisUrl, {
        maxRetriesPerRequest: null, // Required by BullMQ
    });
}
catch (error) {
    console.error('[Queue] Failed to connect to Redis:', error);
    // Fail-safe mock/stub connection so application doesn't crash
    connection = new ioredis_1.default({
        lazyConnect: true,
        maxRetriesPerRequest: null,
    });
}
exports.summarizationQueue = new bullmq_1.Queue(common_1.QUEUE_NAMES.SUMMARIZATION, {
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
async function enqueueSummarizationJob(jobId) {
    await exports.summarizationQueue.add('summarize', { jobId });
    console.log(`[Queue] Job ${jobId} enqueued successfully.`);
}
