import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './lib/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verisumm';

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Start Server
async function startServer() {
  await connectDB(MONGO_URI);

  app.listen(PORT, () => {
    console.log(`[Backend] Express server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Backend] Failed to start server:', err);
  process.exit(1);
});
