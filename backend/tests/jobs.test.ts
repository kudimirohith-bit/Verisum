import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app';
import { UserModel } from '../src/models/User';
import { DocumentModel } from '../src/models/Document';
import { SummarizationJobModel } from '../src/models/SummarizationJob';
import { SummaryModel } from '../src/models/Summary';
import { AuditLogModel } from '../src/models/AuditLog';
import { signAccessToken } from '../src/auth/tokens';
import { processSummarizationJob } from '../src/jobs/processor';

// Allow all backends (including hosted_llm) in this integration test.
// The deployment guard is tested separately in deploymentMode.test.ts.
jest.mock('../src/config/deployment', () => ({
  validateBackendAccess: jest.fn().mockReturnValue({ allowed: true }),
  getDeploymentMode: jest.fn().mockReturnValue('hybrid'),
  isOfflineMode: jest.fn().mockReturnValue(false),
}));

// ── Mock BullMQ Queue to run Worker processor inline in the test thread ───────
jest.mock('../src/jobs/queue', () => ({
  enqueueSummarizationJob: jest.fn().mockImplementation(async (jobId: string) => {
    // Run the worker processor function immediately and synchronously to process the job
    const { processSummarizationJob } = require('../src/jobs/processor');
    await processSummarizationJob(jobId);
  }),
}));

let mongod: MongoMemoryServer;

// ── DB lifecycle ───────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function createUser(
  email: string,
  role: 'clinician' | 'researcher' | 'admin' = 'clinician',
) {
  const hash = await bcrypt.hash('testPass1!', 1);
  const user = await UserModel.create({ email, role, passwordHash: hash });
  const token = signAccessToken({ sub: user._id.toString(), email: user.email, role: user.role });
  return { user, token };
}

// ══════════════════════════════════════════════════════════════════════════════
// JOBS INTEGRATION TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('Summarization Jobs Integration Tests', () => {
  it('creates and completes a job for "mock", "local_clinical_model", and "hosted_llm"', async () => {
    const { token } = await createUser('clinician@jobs.io', 'clinician');

    // Seed a demo document
    const doc = await DocumentModel.create({
      ownerId: new mongoose.Types.ObjectId(),
      docType: 'discharge_summary',
      rawText: 'Patient is a 55-year-old male admitted with chest pain. EKG showed sinus tachycardia. Cardiac enzymes were normal. Patient discharged home.',
      sourceFilename: 'ehr_demo.txt',
      phiStatus: 'deidentified',
    });

    const backends = ['mock', 'local_clinical_model', 'hosted_llm'];

    for (const backend of backends) {
      // 1. Submit the job
      const res = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          documentIds: [doc._id.toString()],
          modelBackend: backend,
        });

      expect(res.status).toBe(201);
      expect(res.body.job).toBeDefined();
      expect(res.body.job.status).toBe('queued'); // Returned as queued when created

      const jobId = res.body.job.id;

      // 2. Assert job status is updated to 'completed' in the database (since verification finished)
      const jobDb = await SummarizationJobModel.findById(jobId);
      expect(jobDb).toBeDefined();
      expect(jobDb!.status).toBe('completed');
      expect(jobDb!.completedAt).toBeDefined();

      // 3. Assert a Summary document was created with non-empty summaryText and consistencyScore
      const summary = await SummaryModel.findOne({ jobId });
      expect(summary).toBeDefined();
      expect(summary!.summaryText).not.toBe('');
      expect(summary!.tokenCount).toBeGreaterThan(0);
      expect(summary!.consistencyScore).not.toBeNull();
      expect(summary!.automaticMetrics).toBeDefined();
      expect(summary!.automaticMetrics.modelName).toBeDefined();

      // Check modelName based on backend
      expect(summary!.automaticMetrics.modelName).toBe(backend);

      // 4. Assert AuditLog entry was emitted
      const auditLog = await AuditLogModel.findOne({ jobId, eventType: 'summarize' });
      expect(auditLog).toBeDefined();
      expect(auditLog!.payload.action).toBe('job_summarized');
      expect(auditLog!.payload.modelBackend).toBe(backend);
    }
  });

  it('fails if documentIds list is empty', async () => {
    const { token } = await createUser('clinician@jobs.io', 'clinician');

    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        documentIds: [],
        modelBackend: 'mock',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('fails if documentId does not exist', async () => {
    const { token } = await createUser('clinician@jobs.io', 'clinician');
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        documentIds: [fakeId],
        modelBackend: 'mock',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
