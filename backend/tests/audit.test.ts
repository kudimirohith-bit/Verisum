import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('axios', () => {
  const handler = async (url: string) => {
    if (url.includes('/nli-check')) {
      return { data: { entailment_score: 0.95, contradiction_score: 0.02, neutral_score: 0.03, verdict: 'entailment' } };
    }
    if (url.includes('/llm-judge')) {
      return { data: { consistencyScore: 0.95, reasoning: 'Consistent claim', verdict: 'entailment' } };
    }
    if (url.includes('/deid/ner') || url.includes('/ner') || url.includes('/deidentify')) {
      return { data: { entities: [], deidentified_text: 'Patient presented with headache and hypertension BP 140/90.' } };
    }
    return { data: { status: 'ok' } };
  };

  const mockPost = jest.fn().mockImplementation(handler);
  const mockGet = jest.fn().mockResolvedValue({ data: { status: 'ok' } });
  const mockCreate = jest.fn().mockReturnThis();

  return {
    __esModule: true,
    default: {
      post: mockPost,
      get: mockGet,
      create: mockCreate,
    },
    post: mockPost,
    get: mockGet,
    create: mockCreate,
  };
});

process.env.MODEL_SERVICE_URL = 'http://127.0.0.1:1';

import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { UserModel } from '../src/models/User.js';
import { DocumentModel } from '../src/models/Document.js';
import { SummarizationJobModel } from '../src/models/SummarizationJob.js';
import { SummaryModel } from '../src/models/Summary.js';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { AuditLogger } from '../src/audit/AuditLogger.js';
import { signAccessToken } from '../src/auth/tokens.js';
import { processSummarizationJob } from '../src/jobs/processor.js';

let mongoServer: MongoMemoryServer;
let adminToken: string;
let adminId: string;
let clinicianToken: string;
let clinicianId: string;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  const admin = await UserModel.create({
    email: 'admin_audit@verisumm.io',
    passwordHash: 'hash',
    role: 'admin',
  });
  adminId = admin._id.toString();
  adminToken = signAccessToken({ sub: adminId, email: admin.email, role: admin.role });

  const clinician = await UserModel.create({
    email: 'clinician_audit@verisumm.io',
    passwordHash: 'hash',
    role: 'clinician',
  });
  clinicianId = clinician._id.toString();
  clinicianToken = signAccessToken({ sub: clinicianId, email: clinician.email, role: clinician.role });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await AuditLogModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await SummarizationJobModel.deleteMany({});
  await SummaryModel.deleteMany({});
});

describe('Chunk 0.9 — Full Audit Logging & Traceability Test Suite', () => {
  describe('1. Request ID Middleware & Lineage Propagation', () => {
    it('propagates X-Request-ID header to HTTP response and AsyncLocalStorage audit logs', async () => {
      const customRequestId = 'test-req-lineage-12345';

      const res = await request(app)
        .post('/documents')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .set('X-Request-ID', customRequestId)
        .field('docType', 'ehr_note')
        .field('rawText', 'Patient presented with headache and hypertension BP 140/90.');

      expect(res.status).toBe(201);
      expect(res.headers['x-request-id']).toBe(customRequestId);

      const logs = await AuditLogModel.find({ requestId: customRequestId });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].eventType).toBe('upload');
      expect(logs[0].requestId).toBe(customRequestId);
      expect(logs[0].actorId?.toString()).toBe(clinicianId);
    });
  });

  describe('2. PHI Redaction & Immutability Enforcement', () => {
    it('automatically redacts raw PHI text keys from payload', async () => {
      await AuditLogger.log({
        eventType: 'upload',
        actorId: clinicianId,
        payload: {
          action: 'test_scrub',
          rawText: 'CONFIDENTIAL PATIENT RECORD JOHN DOE DOB 01/01/1970',
          summaryText: 'Summary containing patient name John Doe',
          docType: 'ehr_note',
        },
      });

      const log = await AuditLogModel.findOne({ eventType: 'upload' }).lean();
      expect(log).not.toBeNull();
      expect(log!.payload.rawText).toBe('[REDACTED_PHI]');
      expect(log!.payload.summaryText).toBe('[REDACTED_PHI]');
      expect(log!.payload.docType).toBe('ehr_note');
    });

    it('enforces immutability by blocking updates and deletions on AuditLog documents', async () => {
      const log = await AuditLogModel.create({
        eventType: 'auth',
        actorId: adminId,
        payload: { action: 'initial' },
      });

      await expect(
        AuditLogModel.updateOne({ _id: log._id }, { $set: { eventType: 'review' } }),
      ).rejects.toThrow('Audit logs are immutable and cannot be updated or deleted.');

      await expect(
        AuditLogModel.deleteOne({ _id: log._id }),
      ).rejects.toThrow('Audit logs are immutable and cannot be updated or deleted.');
    });
  });

  describe('3. Full End-to-End Audit Lineage Chain', () => {
    it(
      'produces a correlated chain of audit documents across login -> upload -> summarize -> verify -> feedback',
      async () => {
        const requestId = 'e2e-flow-lineage-999';

        // 1. Upload
        const uploadRes = await request(app)
          .post('/documents')
          .set('Authorization', `Bearer ${clinicianToken}`)
          .set('X-Request-ID', requestId)
          .field('docType', 'ehr_note')
          .field('rawText', 'Patient is a 60yo male with Type 2 Diabetes taking Metformin 500mg daily.');

        expect(uploadRes.status).toBe(201);
        const docId = uploadRes.body.document.id;

        // 2. Create Job
        const jobRes = await request(app)
          .post('/jobs')
          .set('Authorization', `Bearer ${clinicianToken}`)
          .set('X-Request-ID', requestId)
          .send({
            documentIds: [docId],
            modelBackend: 'mock',
          });

        expect(jobRes.status).toBe(201);
        const jobId = jobRes.body.job.id;

        // 3. Process Job (Generates summarize and verify audit entries)
        await processSummarizationJob(jobId);

        const jobStatusRes = await request(app)
          .get(`/jobs/${jobId}`)
          .set('Authorization', `Bearer ${clinicianToken}`);
        const summaryId = jobStatusRes.body.summary._id;

        // 4. Feedback Submission
        await request(app)
          .post(`/summaries/${summaryId}/feedback`)
          .set('Authorization', `Bearer ${clinicianToken}`)
          .set('X-Request-ID', requestId)
          .send({
            completenessRating: 5,
            correctnessRating: 4,
            concisenessRating: 5,
            comment: 'Very accurate summary.',
          });

        // Assert full audit lineage chain
        const auditChain = await AuditLogModel.find({
          $or: [{ requestId }, { jobId }, { summaryId }],
        }).sort({ createdAt: 1 });

        expect(auditChain.length).toBeGreaterThanOrEqual(4);

        const eventTypes = auditChain.map((a) => a.eventType);
        expect(eventTypes).toContain('upload');
        expect(eventTypes).toContain('summarize');
        expect(eventTypes).toContain('verify');
        expect(eventTypes).toContain('review');
      },
      60000,
    );
  });

  describe('4. GET /audit API Filtering & Admin RBAC', () => {
    it('restricts /audit access to admin role', async () => {
      const res = await request(app)
        .get('/audit')
        .set('Authorization', `Bearer ${clinicianToken}`);

      expect(res.status).toBe(403);
    });

    it('supports eventType and pagination filters for admin role', async () => {
      await AuditLogger.log({ eventType: 'upload', actorId: adminId });
      await AuditLogger.log({ eventType: 'summarize', actorId: adminId });
      await AuditLogger.log({ eventType: 'upload', actorId: adminId });

      const res = await request(app)
        .get('/audit?eventType=upload&page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBe(2);
      expect(res.body.total).toBe(2);
      expect(res.body.logs.every((l: any) => l.eventType === 'upload')).toBe(true);
    });
  });

  describe('5. GET /audit/export API (CSV & JSON Snapshots)', () => {
    it('exports audit snapshot in CSV format with headers', async () => {
      await AuditLogger.log({ eventType: 'auth', actorId: adminId, payload: { action: 'export_test' } });

      const res = await request(app)
        .get('/audit/export?format=csv')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('id,eventType,actorId,documentId,jobId,summaryId,requestId,createdAt,payload');
      expect(res.text).toContain('auth');
    });

    it('exports audit snapshot in JSON format', async () => {
      await AuditLogger.log({ eventType: 'verify', actorId: adminId });

      const res = await request(app)
        .get('/audit/export?format=json')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('6. GET /audit/metrics Benchmarking Aggregations', () => {
    it('returns aggregated volume, consistency, feedback, and flagged claim metrics', async () => {
      const doc = await DocumentModel.create({
        ownerId: clinicianId,
        docType: 'ehr_note',
        rawText: 'Test text',
        sourceFilename: 'ehr_note_test.txt',
        phiStatus: 'deidentified',
        uploadedAt: new Date(),
      });

      const job = await SummarizationJobModel.create({
        documentIds: [doc._id],
        modelBackend: 'mock',
        status: 'completed',
        createdAt: new Date(),
      });

      await SummaryModel.create({
        jobId: job._id,
        summaryText: 'Summary output text',
        tokenCount: 20,
        consistencyScore: 0.95,
        flaggedClaims: [],
        automaticMetrics: { modelName: 'mock' },
        createdAt: new Date(),
      });

      const res = await request(app)
        .get('/audit/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.volumeOverTime).toBeDefined();
      expect(res.body.avgConsistencyByBackend).toBeDefined();
      expect(res.body.avgFeedbackByBackend).toBeDefined();
      expect(res.body.flaggedClaimRateByDocType).toBeDefined();
    });
  });
});
