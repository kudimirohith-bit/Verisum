"use strict";
/**
 * Benchmarking API Router — backend/src/benchmark/router.ts
 *
 * REST Endpoints for running benchmarks, retrieving comparative reports,
 * correlation analyses, and seeding synthetic benchmark feedback data.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.benchmarkRouter = void 0;
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const middleware_js_1 = require("../auth/middleware.js");
const BenchmarkRun_js_1 = require("../models/BenchmarkRun.js");
const runner_js_1 = require("./runner.js");
const stats_js_1 = require("./stats.js");
const Summary_js_1 = require("../models/Summary.js");
const ClinicianFeedback_js_1 = require("../models/ClinicianFeedback.js");
const User_js_1 = require("../models/User.js");
const deployment_js_1 = require("../config/deployment.js");
exports.benchmarkRouter = (0, express_1.Router)();
/**
 * POST /benchmark/run
 * Trigger an automated benchmark suite run across document IDs and backends.
 * Guards: Admin or Researcher.
 */
exports.benchmarkRouter.post('/run', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('admin', 'researcher'), async (req, res) => {
    try {
        const { name, documentIds, modelBackends, docType } = req.body;
        if (Array.isArray(modelBackends)) {
            for (const b of modelBackends) {
                const access = (0, deployment_js_1.validateBackendAccess)(b);
                if (!access.allowed) {
                    res.status(403).json({ error: 'Forbidden', message: access.message });
                    return;
                }
            }
        }
        const run = await (0, runner_js_1.runBenchmarkSuite)({
            name,
            documentIds,
            modelBackends,
            docType,
        });
        res.status(201).json({
            message: 'Benchmark run completed successfully.',
            benchmarkRun: run,
        });
    }
    catch (error) {
        console.error('[Benchmark API] Benchmark execution failed:', error);
        res.status(500).json({
            error: 'BenchmarkError',
            message: `Benchmark execution failed: ${error.message}`,
        });
    }
});
/**
 * GET /benchmark/runs
 * List all historical benchmark run executions.
 * Guards: Authenticated.
 */
exports.benchmarkRouter.get('/runs', middleware_js_1.requireAuth, async (req, res) => {
    try {
        const runs = await BenchmarkRun_js_1.BenchmarkRunModel.find({}).sort({ createdAt: -1 }).lean();
        res.json({ runs });
    }
    catch (error) {
        res.status(500).json({ error: 'DatabaseError', message: error.message });
    }
});
/**
 * GET /benchmark/runs/:id
 * Retrieve specific benchmark run details.
 * Guards: Authenticated.
 */
exports.benchmarkRouter.get('/runs/:id', middleware_js_1.requireAuth, async (req, res) => {
    try {
        const run = await BenchmarkRun_js_1.BenchmarkRunModel.findById(req.params.id);
        if (!run) {
            res.status(404).json({ error: 'NotFound', message: 'Benchmark run not found.' });
            return;
        }
        res.json({ benchmarkRun: run });
    }
    catch (error) {
        res.status(500).json({ error: 'DatabaseError', message: error.message });
    }
});
/**
 * GET /benchmark/runs/:id/report
 * Export benchmark report in Markdown or JSON format.
 * Guards: Authenticated.
 */
exports.benchmarkRouter.get('/runs/:id/report', middleware_js_1.requireAuth, async (req, res) => {
    try {
        const run = await BenchmarkRun_js_1.BenchmarkRunModel.findById(req.params.id);
        if (!run) {
            res.status(404).json({ error: 'NotFound', message: 'Benchmark run not found.' });
            return;
        }
        const format = req.query.format || 'markdown';
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
    }
    catch (error) {
        res.status(500).json({ error: 'DatabaseError', message: error.message });
    }
});
/**
 * GET /benchmark/correlation
 * Real-time correlation analysis between automatic NLP metrics and clinician ratings.
 * Guards: Authenticated.
 */
exports.benchmarkRouter.get('/correlation', middleware_js_1.requireAuth, async (req, res) => {
    try {
        const pairs = await (0, runner_js_1.getSummaryEvaluationPairs)();
        const correlationStats = (0, stats_js_1.computeCorrelationStats)(pairs);
        res.json({
            sampleSize: pairs.length,
            correlationStats,
            evaluationPairs: pairs,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'CalculationError', message: error.message });
    }
});
/**
 * POST /benchmark/seed-synthetic-feedback
 * Helper endpoint to generate ~30 synthetic clinician feedback documents for test fixtures.
 * Guards: Admin.
 */
exports.benchmarkRouter.post('/seed-synthetic-feedback', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('admin'), async (req, res) => {
    try {
        const summaries = await Summary_js_1.SummaryModel.find({}).limit(30);
        if (summaries.length === 0) {
            res.status(400).json({ error: 'NoSummaries', message: 'Create summaries before seeding synthetic feedback.' });
            return;
        }
        let reviewer = await User_js_1.UserModel.findOne({ role: 'clinician' });
        if (!reviewer) {
            reviewer = await User_js_1.UserModel.findOne({});
        }
        const reviewerId = reviewer ? reviewer._id : req.user.sub;
        let seededCount = 0;
        for (let i = 0; i < 30; i++) {
            const summary = summaries[i % summaries.length];
            // Generate synthetic scores with realistic variance
            const isGoodBackend = i % 3 === 0;
            const completenessRating = isGoodBackend ? 4 + (i % 2) : 2 + (i % 3);
            const correctnessRating = isGoodBackend ? 4 + (i % 2) : 2 + (i % 3);
            const concisenessRating = 3 + (i % 3);
            try {
                const synthReviewerId = new mongoose_1.Types.ObjectId();
                await ClinicianFeedback_js_1.ClinicianFeedbackModel.create({
                    summaryId: summary._id,
                    reviewerId: synthReviewerId,
                    completenessRating,
                    correctnessRating,
                    concisenessRating,
                    comment: `Synthetic clinician evaluation #${i + 1}`,
                });
                seededCount++;
            }
            catch {
                // Ignore duplicate
            }
        }
        res.json({ message: `Successfully seeded ${seededCount} synthetic clinician feedback documents.`, count: seededCount });
    }
    catch (error) {
        res.status(500).json({ error: 'SeedError', message: error.message });
    }
});
