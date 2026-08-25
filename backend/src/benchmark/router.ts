/**
 * Benchmarking API Router — backend/src/benchmark/router.ts
 *
 * REST Endpoints for running benchmarks, retrieving comparative reports,
 * correlation analyses, and seeding synthetic benchmark feedback data.
 */

import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { BenchmarkRunModel } from '../models/BenchmarkRun.js';
import { runBenchmarkSuite, getSummaryEvaluationPairs } from './runner.js';
import { computeCorrelationStats } from './stats.js';
import { SummaryModel } from '../models/Summary.js';
import { ClinicianFeedbackModel } from '../models/ClinicianFeedback.js';
import { UserModel } from '../models/User.js';

export const benchmarkRouter = Router();

/**
 * POST /benchmark/run
 * Trigger an automated benchmark suite run across document IDs and backends.
 * Guards: Admin or Researcher.
 */
benchmarkRouter.post(
  '/run',
  requireAuth,
  requireRole('admin', 'researcher'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, documentIds, modelBackends, docType } = req.body;

      const run = await runBenchmarkSuite({
        name,
        documentIds,
        modelBackends,
        docType,
      });

      res.status(201).json({
        message: 'Benchmark run completed successfully.',
        benchmarkRun: run,
      });
    } catch (error: any) {
      console.error('[Benchmark API] Benchmark execution failed:', error);
      res.status(500).json({
        error: 'BenchmarkError',
        message: `Benchmark execution failed: ${error.message}`,
      });
    }
  },
);

/**
 * GET /benchmark/runs
 * List all historical benchmark run executions.
 * Guards: Authenticated.
 */
benchmarkRouter.get(
  '/runs',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const runs = await BenchmarkRunModel.find({}).sort({ createdAt: -1 }).lean();
      res.json({ runs });
    } catch (error: any) {
      res.status(500).json({ error: 'DatabaseError', message: error.message });
    }
  },
);

/**
 * GET /benchmark/runs/:id
 * Retrieve specific benchmark run details.
 * Guards: Authenticated.
 */
benchmarkRouter.get(
  '/runs/:id',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const run = await BenchmarkRunModel.findById(req.params.id);
      if (!run) {
        res.status(404).json({ error: 'NotFound', message: 'Benchmark run not found.' });
        return;
      }
      res.json({ benchmarkRun: run });
    } catch (error: any) {
      res.status(500).json({ error: 'DatabaseError', message: error.message });
    }
  },
);

/**
 * GET /benchmark/runs/:id/report
 * Export benchmark report in Markdown or JSON format.
 * Guards: Authenticated.
 */
benchmarkRouter.get(
  '/runs/:id/report',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const run = await BenchmarkRunModel.findById(req.params.id);
      if (!run) {
        res.status(404).json({ error: 'NotFound', message: 'Benchmark run not found.' });
        return;
      }

      const format = (req.query.format as string) || 'markdown';

      if (format === 'json') {
        res.json({
          runId: run._id,
          name: run.name,
          resultsPerBackend: run.resultsPerBackend,
          correlationStats: run.correlationStats,
          reportMarkdown: run.reportMarkdown,
        });
        return;
      }

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="benchmark_report_${run._id}.md"`);
      res.send(run.reportMarkdown || '# Benchmark Report Empty');
    } catch (error: any) {
      res.status(500).json({ error: 'DatabaseError', message: error.message });
    }
  },
);

/**
 * GET /benchmark/correlation
 * Real-time correlation analysis between automatic NLP metrics and clinician ratings.
 * Guards: Authenticated.
 */
benchmarkRouter.get(
  '/correlation',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pairs = await getSummaryEvaluationPairs();
      const correlationStats = computeCorrelationStats(pairs);

      res.json({
        sampleSize: pairs.length,
        correlationStats,
        evaluationPairs: pairs,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'CalculationError', message: error.message });
    }
  },
);

/**
 * POST /benchmark/seed-synthetic-feedback
 * Helper endpoint to generate ~30 synthetic clinician feedback documents for test fixtures.
 * Guards: Admin.
 */
benchmarkRouter.post(
  '/seed-synthetic-feedback',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const summaries = await SummaryModel.find({}).limit(30);
      if (summaries.length === 0) {
        res.status(400).json({ error: 'NoSummaries', message: 'Create summaries before seeding synthetic feedback.' });
        return;
      }

      let reviewer = await UserModel.findOne({ role: 'clinician' });
      if (!reviewer) {
        reviewer = await UserModel.findOne({});
      }

      const reviewerId = reviewer ? reviewer._id : req.user!.sub;
      let seededCount = 0;

      for (let i = 0; i < 30; i++) {
        const summary = summaries[i % summaries.length];

        // Generate synthetic scores with realistic variance
        const isGoodBackend = i % 3 === 0;
        const completenessRating = isGoodBackend ? 4 + (i % 2) : 2 + (i % 3);
        const correctnessRating = isGoodBackend ? 4 + (i % 2) : 2 + (i % 3);
        const concisenessRating = 3 + (i % 3);

        try {
          const synthReviewerId = new Types.ObjectId();
          await ClinicianFeedbackModel.create({
            summaryId: summary._id,
            reviewerId: synthReviewerId,
            completenessRating,
            correctnessRating,
            concisenessRating,
            comment: `Synthetic clinician evaluation #${i + 1}`,
          });
          seededCount++;
        } catch {
          // Ignore duplicate
        }
      }

      res.json({ message: `Successfully seeded ${seededCount} synthetic clinician feedback documents.`, count: seededCount });
    } catch (error: any) {
      res.status(500).json({ error: 'SeedError', message: error.message });
    }
  },
);
