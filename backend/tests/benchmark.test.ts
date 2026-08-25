/**
 * Benchmarking Harness Integration Test Suite — backend/tests/benchmark.test.ts
 *
 * Tests automatic NLP metrics computation (ROUGE, BERTScore, Entity F1),
 * correlation calculations (Pearson r / Spearman ρ), POST /benchmark/run execution grid,
 * synthetic feedback seeding, and Markdown benchmark report exports.
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app.js';
import { UserModel } from '../src/models/User.js';
import { DocumentModel } from '../src/models/Document.js';
import { SummaryModel } from '../src/models/Summary.js';
import { ClinicianFeedbackModel } from '../src/models/ClinicianFeedback.js';
import { BenchmarkRunModel } from '../src/models/BenchmarkRun.js';
import { computeAutomaticMetrics } from '../src/benchmark/metrics.js';
import { pearsonCorrelation, spearmanCorrelation, computeCorrelationStats } from '../src/benchmark/stats.js';
import { runBenchmarkSuite } from '../src/benchmark/runner.js';
import { signAccessToken } from '../src/auth/tokens.js';

let mongoServer: MongoMemoryServer;
let adminToken: string;
let researcherToken: string;
let clinicianToken: string;
let adminId: string;
let researcherId: string;
let clinicianId: string;
let demoDocId: string;

describe('Chunk 0.10 — Benchmarking Harness Test Suite', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create users
    const adminUser = await UserModel.create({
      email: 'admin_bench@verisumm.io',
      passwordHash: 'hash',
      role: 'admin',
    });
    adminId = adminUser._id.toString();
    adminToken = signAccessToken({ sub: adminId, email: adminUser.email, role: 'admin' });

    const researcherUser = await UserModel.create({
      email: 'researcher_bench@verisumm.io',
      passwordHash: 'hash',
      role: 'researcher',
    });
    researcherId = researcherUser._id.toString();
    researcherToken = signAccessToken({ sub: researcherId, email: researcherUser.email, role: 'researcher' });

    const clinicianUser = await UserModel.create({
      email: 'clinician_bench@verisumm.io',
      passwordHash: 'hash',
      role: 'clinician',
    });
    clinicianId = clinicianUser._id.toString();
    clinicianToken = signAccessToken({ sub: clinicianId, email: clinicianUser.email, role: 'clinician' });

    // Seed test document
    const doc = await DocumentModel.create({
      ownerId: adminUser._id,
      docType: 'ehr_note',
      rawText:
        'Patient is a 62-year-old male with Type 2 Diabetes and Hypertension. Current medication: Metformin 1000mg twice daily and Lisinopril 10mg once daily. Blood pressure today is 138/84 mmHg.',
      sourceFilename: 'bench_ehr_test.txt',
      phiStatus: 'deidentified',
      uploadedAt: new Date(),
    });
    demoDocId = doc._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('1. Automatic NLP Metrics Computation', () => {
    it('computes ROUGE-1, ROUGE-2, ROUGE-L, BERTScore, and Entity F1 correctly', async () => {
      const referenceText = 'Patient has Type 2 Diabetes treated with Metformin 1000mg daily.';
      const summaryText = 'Patient with Type 2 Diabetes takes Metformin 1000mg daily.';

      const metrics = await computeAutomaticMetrics(summaryText, referenceText);

      expect(metrics).toHaveProperty('rouge1');
      expect(metrics).toHaveProperty('rouge2');
      expect(metrics).toHaveProperty('rougeL');
      expect(metrics).toHaveProperty('bertScore');
      expect(metrics).toHaveProperty('entityF1');

      expect(metrics.rouge1.f1).toBeGreaterThan(0.5);
      expect(metrics.rouge2.f1).toBeGreaterThan(0.3);
      expect(metrics.rougeL.f1).toBeGreaterThan(0.5);
      expect(metrics.bertScore.f1).toBeGreaterThan(0.6);
      expect(metrics.entityF1).toBeGreaterThan(0.5);
    });
  });

  describe('2. Statistical Correlation Helpers (Pearson & Spearman)', () => {
    it('calculates Pearson r and Spearman ρ accurately for ideal linear relationships', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const r = pearsonCorrelation(x, y);
      const rho = spearmanCorrelation(x, y);

      expect(r).toBe(1.0);
      expect(rho).toBe(1.0);
    });

    it('calculates correlation stats for synthetic clinician feedback pairs', () => {
      const mockPairs: any[] = [];
      for (let i = 0; i < 30; i++) {
        const autoScore = 0.4 + (i / 50);
        const humanRating = Math.min(5, Math.max(1, Math.round(1 + autoScore * 4)));
        mockPairs.push({
          summaryId: `summary_${i}`,
          modelBackend: i % 2 === 0 ? 'local_clinical_model' : 'hosted_llm',
          docType: 'ehr_note',
          automaticMetrics: {
            rouge1: { f1: autoScore },
            rouge2: { f1: autoScore * 0.8 },
            rougeL: { f1: autoScore * 0.9 },
            bertScore: { f1: autoScore * 0.95 },
            entityF1: autoScore,
          },
          consistencyScore: autoScore,
          feedback: {
            completeness: humanRating,
            correctness: humanRating,
            conciseness: humanRating,
            overall: humanRating,
          },
        });
      }

      const stats = computeCorrelationStats(mockPairs);
      expect(stats.length).toBeGreaterThan(0);

      const rouge1VsOverall = stats.find(
        (s) => s.metricName === 'rouge1_f1' && s.humanDimension === 'overall',
      );
      expect(rouge1VsOverall).toBeDefined();
      expect(rouge1VsOverall!.sampleSize).toBe(30);
      expect(rouge1VsOverall!.pearsonR).toBeGreaterThan(0.7);
    });
  });

  describe('3. POST /benchmark/run API Execution Grid', () => {
    it('restricts /benchmark/run access to clinician role', async () => {
      const res = await request(app)
        .post('/benchmark/run')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({ documentIds: [demoDocId] });

      expect(res.status).toBe(403);
    });

    it('runs benchmark across mock, local_clinical_model, and hosted_llm for researcher role', async () => {
      const res = await request(app)
        .post('/benchmark/run')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          name: 'Integration Test Benchmark Grid',
          documentIds: [demoDocId],
          modelBackends: ['mock', 'local_clinical_model', 'hosted_llm'],
        });

      expect(res.status).toBe(201);
      expect(res.body.benchmarkRun).toBeDefined();

      const run = res.body.benchmarkRun;
      expect(run.status).toBe('completed');
      expect(run.resultsPerBackend.length).toBe(3);

      const backends = run.resultsPerBackend.map((b: any) => b.modelBackend);
      expect(backends).toContain('mock');
      expect(backends).toContain('local_clinical_model');
      expect(backends).toContain('hosted_llm');

      for (const b of run.resultsPerBackend) {
        expect(b.count).toBe(1);
        expect(b.avgRouge1).toBeGreaterThanOrEqual(0);
        expect(b.avgBertScore).toBeGreaterThanOrEqual(0);
        expect(b.avgConsistencyScore).toBeGreaterThanOrEqual(0);
        expect(b.avgLatencyMs).toBeGreaterThan(0);
      }
    });
  });

  describe('4. Synthetic Feedback Seeding & Correlation Endpoint', () => {
    it('POST /benchmark/seed-synthetic-feedback seeds 30 clinician ratings', async () => {
      const res = await request(app)
        .post('/benchmark/seed-synthetic-feedback')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(30);

      const feedbackCount = await ClinicianFeedbackModel.countDocuments();
      expect(feedbackCount).toBe(30);
    });

    it('GET /benchmark/correlation computes metrics-vs-human correlations', async () => {
      const res = await request(app)
        .get('/benchmark/correlation')
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sampleSize).toBeGreaterThan(0);
      expect(res.body.correlationStats.length).toBeGreaterThan(0);
    });
  });

  describe('5. Benchmark Report Export API', () => {
    it('GET /benchmark/runs/:id/report exports report as Markdown', async () => {
      const runs = await BenchmarkRunModel.find({ status: 'completed' });
      expect(runs.length).toBeGreaterThan(0);
      const runId = runs[0]._id.toString();

      const res = await request(app)
        .get(`/benchmark/runs/${runId}/report`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toContain('# VeriSumm Benchmarking Report');
      expect(res.text).toContain('## 1. Model Backend Comparison Summary');
      expect(res.text).toContain('## 3. Automatic Metrics vs. Clinician Judgment Correlation');
    });

    it('GET /benchmark/runs/:id/report exports report in JSON format', async () => {
      const runs = await BenchmarkRunModel.find({ status: 'completed' });
      const runId = runs[0]._id.toString();

      const res = await request(app)
        .get(`/benchmark/runs/${runId}/report?format=json`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.runId).toBe(runId);
      expect(res.body.resultsPerBackend).toBeDefined();
      expect(res.body.reportMarkdown).toBeDefined();
    });
  });

  describe('6. Full Benchmark Suite Core Runner', () => {
    it('executes runBenchmarkSuite programmatically', async () => {
      const run = await runBenchmarkSuite({
        name: 'Direct Programmatic Execution',
        documentIds: [demoDocId],
        modelBackends: ['mock', 'local_clinical_model'],
      });

      expect(run.status).toBe('completed');
      expect(run.resultsPerBackend.length).toBe(2);
      expect(run.reportMarkdown).toContain('Model Backend Comparison Summary');
    });
  });
});
