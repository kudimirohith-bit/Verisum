import dotenv from 'dotenv';
import { QUEUE_NAMES } from '@verisumm/common';

dotenv.config();

console.log(`[Worker] VeriSumm BullMQ Worker initialized.`);
console.log(`[Worker] Listening on queue: ${QUEUE_NAMES.SUMMARIZATION}`);

// Keep process alive for worker container
setInterval(() => {
  // Heartbeat logging
}, 60000);
