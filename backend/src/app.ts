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
import { studiesRouter } from './studies/router.js';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getSecret } from './config/secrets.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin: getSecret('FRONTEND_URL', getSecret('CORS_ORIGIN', 'http://localhost:5173')),
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(requestIdMiddleware);

// Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Too many requests to authentication endpoint.' },
});

const documentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Too many document uploads.' },
});

// ── Health Check ───────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/auth', authLimiter, authRouter);
app.use('/documents', documentLimiter, ingestionRouter);
app.use('/jobs', jobsRouter);
app.use('/summaries', summariesRouter);
app.use('/audit', auditRouter);
app.use('/benchmark', benchmarkRouter);
app.use('/collections', collectionsRouter);
app.use('/studies', studiesRouter);

export { app };
