import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { app } from '../src/app.js';
import { UserModel } from '../src/models/User.js';
import { DocumentModel } from '../src/models/Document.js';
import { DocumentCollectionModel } from '../src/models/DocumentCollection.js';
import { signAccessToken } from '../src/auth/tokens.js';
import { getSecret } from '../src/config/secrets.js';
import { validateBackendAccess, getDeploymentMode } from '../src/config/deployment.js';

let mongoServer: MongoMemoryServer;
let adminToken: string;
let clinicianToken: string;
let testDocId: string;
let testCollectionId: string;

describe('0.12 — Deployment, Self-Hosting & Security Hardening (Deployment Mode & Secrets)', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const adminUser = await UserModel.create({
      email: 'admin@verisumm.org',
      passwordHash: 'hash',
      role: 'admin',
    });

    const clinicianUser = await UserModel.create({
      email: 'doc@verisumm.org',
      passwordHash: 'hash',
      role: 'clinician',
    });

    adminToken = signAccessToken({
      sub: adminUser._id.toString(),
      email: adminUser.email,
      role: adminUser.role,
    });

    clinicianToken = signAccessToken({
      sub: clinicianUser._id.toString(),
      email: clinicianUser.email,
      role: clinicianUser.role,
    });

    const doc = await DocumentModel.create({
      ownerId: clinicianUser._id.toString(),
      docType: 'ehr_note',
      rawText: 'Patient presents with hypertension. BP 140/90. Prescribed Lisinopril.',
      sourceFilename: 'note1.txt',
    });
    testDocId = doc._id.toString();

    const collection = await DocumentCollectionModel.create({
      name: 'Test Offline Collection',
      ownerId: clinicianUser._id.toString(),
      docType: 'ehr_note',
    });
    testCollectionId = collection._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('Secrets Management Helper', () => {
    it('reads standard environment variables', () => {
      process.env.TEST_SECRET_KEY = 'my-secret-val';
      expect(getSecret('TEST_SECRET_KEY')).toBe('my-secret-val');
      delete process.env.TEST_SECRET_KEY;
    });

    it('supports reading secrets from a mounted file (_FILE suffix)', () => {
      const tmpSecretFile = path.join(__dirname, 'tmp_secret.txt');
      fs.writeFileSync(tmpSecretFile, 'file-mounted-secret-content\n', 'utf-8');

      process.env.TEST_FILE_SECRET_FILE = tmpSecretFile;
      expect(getSecret('TEST_FILE_SECRET')).toBe('file-mounted-secret-content');

      // Cleanup
      delete process.env.TEST_FILE_SECRET_FILE;
      if (fs.existsSync(tmpSecretFile)) fs.unlinkSync(tmpSecretFile);
    });
  });

  describe('DEPLOYMENT_MODE=offline Enforcement', () => {
    const originalEnv = process.env.DEPLOYMENT_MODE;

    beforeEach(() => {
      process.env.DEPLOYMENT_MODE = 'offline';
    });

    afterEach(() => {
      process.env.DEPLOYMENT_MODE = originalEnv;
    });

    it('correctly identifies offline deployment mode', () => {
      expect(getDeploymentMode()).toBe('offline');
      expect(validateBackendAccess('hosted_llm').allowed).toBe(false);
      expect(validateBackendAccess('local_clinical_model').allowed).toBe(true);
      expect(validateBackendAccess('mock').allowed).toBe(true);
    });

    it('rejects POST /jobs with hosted_llm with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          documentIds: [testDocId],
          modelBackend: 'hosted_llm',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toContain('Hosted LLM backend is disabled in offline deployment mode.');
    });

    it('allows POST /jobs with local_clinical_model or mock when offline', async () => {
      const res = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          documentIds: [testDocId],
          modelBackend: 'mock',
        });

      expect(res.status).toBe(201);
      expect(res.body.job).toBeDefined();
    });

    it('rejects POST /collections/:id/summarize with hosted_llm in offline mode with 403', async () => {
      const res = await request(app)
        .post(`/collections/${testCollectionId}/summarize`)
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          modelBackend: 'hosted_llm',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Hosted LLM backend is disabled in offline deployment mode.');
    });

    it('rejects POST /benchmark/run including hosted_llm in offline mode with 403', async () => {
      const res = await request(app)
        .post('/benchmark/run')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          modelBackends: ['mock', 'hosted_llm'],
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Hosted LLM backend is disabled in offline deployment mode.');
    });
  });
});
