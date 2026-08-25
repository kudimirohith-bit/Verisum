import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { requestIdMiddleware } from './middleware/requestId.js';
import { authRouter } from './auth/index.js';
import { ingestionRouter } from './ingestion/index.js';
import { jobsRouter } from './jobs/index.js';
import { summariesRouter } from './summaries/index.js';
import { auditRouter } from './audit/index.js';
import { benchmarkRouter } from './benchmark/router.js';
import { collectionsRouter } from './collections/router.js';

dotenv.config();

const app = express();

app.use(cors({ credentials: true, origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.use(cookieParser());
app.use(requestIdMiddleware);

// ── Health Check ───────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/documents', ingestionRouter);
app.use('/jobs', jobsRouter);
app.use('/summaries', summariesRouter);
app.use('/audit', auditRouter);
app.use('/benchmark', benchmarkRouter);
app.use('/collections', collectionsRouter);

export { app };
