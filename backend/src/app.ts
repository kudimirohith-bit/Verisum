import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { authRouter } from './auth/index.js';
import { ingestionRouter } from './ingestion/index.js';
import { jobsRouter } from './jobs/index.js';

dotenv.config();

const app = express();

app.use(cors({ credentials: true, origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.use(cookieParser());

// ── Health Check ───────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/documents', ingestionRouter);
app.use('/jobs', jobsRouter);

export { app };
