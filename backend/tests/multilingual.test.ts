import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app.js';
import { DocumentModel } from '../src/models/Document.js';
import { UserModel } from '../src/models/User.js';
import { signAccessToken } from '../src/auth/tokens.js';
import { detectLanguage, isLanguageSupportedForDeid } from '../src/deid/languageDetector.js';
import { BackendRegistry } from '../src/summarizer/backends.js';
import { VerificationPipeline } from '../src/verification/pipeline.js';

let mongoServer: MongoMemoryServer;
let clinicianToken: string;
let clinicianId: string;

describe('0.14 — Multilingual Extensibility & Fail-Closed Safety Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const user = await UserModel.create({
      email: 'clinician_es@verisumm.org',
      passwordHash: 'hashed_pw',
      fullName: 'Dr. Maria Garcia',
      role: 'clinician',
    });
    clinicianId = user._id.toString();
    clinicianToken = signAccessToken({
      sub: clinicianId,
      email: user.email,
      role: user.role,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('1. Language Detection', () => {
    it('detects English clinical note correctly', () => {
      const text = 'Patient presented with acute chest pain and elevated blood pressure.';
      const res = detectLanguage(text);
      expect(res.language).toBe('en');
      expect(res.isSupportedDeid).toBe(true);
    });

    it('detects Spanish clinical text and marks De-ID as unvalidated', () => {
      const text = 'El paciente presenta dolor torácico agudo y presión arterial elevada del hospital.';
      const res = detectLanguage(text);
      expect(res.language).toBe('es');
      expect(res.isSupportedDeid).toBe(false);
    });

    it('detects French clinical text', () => {
      const text = 'Le patient présente une douleur thoracique aiguë avec hypertension médicale pour le diagnostic.';
      const res = detectLanguage(text);
      expect(res.language).toBe('fr');
      expect(res.isSupportedDeid).toBe(false);
    });
  });

  describe('2. Fail-Closed De-ID Security Policy', () => {
    it('blocks ingestion of unsupported language document when REQUIRE_VALIDATED_DEID is enabled', async () => {
      process.env.REQUIRE_VALIDATED_DEID = 'true';

      const spanishText = 'El paciente Juan Perez presenta dolor agudo en el pecho del hospital central.';

      const res = await request(app)
        .post('/documents')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          docType: 'ehr_note',
          rawText: spanishText,
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('DEID_UNSUPPORTED_LANGUAGE');
      expect(res.body.detectedLanguage).toBe('es');
      expect(res.body.message).toContain("not validated for language 'es'");

      delete process.env.REQUIRE_VALIDATED_DEID;
    });
  });

  describe('3. Backend Language Routing', () => {
    it('rejects job creation if backend does not support document language', async () => {
      const doc = await DocumentModel.create({
        ownerId: clinicianId,
        docType: 'ehr_note',
        rawText: 'El paciente presenta dolor torácico.',
        sourceFilename: 'nota_es.txt',
        language: 'es',
        phiStatus: 'deidentified',
      });

      const res = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          documentIds: [doc._id.toString()],
          modelBackend: 'local_clinical_model', // Local model only supports 'en'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('UNSUPPORTED_BACKEND_LANGUAGE');
      expect(res.body.message).toContain("does not support document language 'es'");
    });

    it('allows job creation when backend supports document language', async () => {
      const doc = await DocumentModel.create({
        ownerId: clinicianId,
        docType: 'ehr_note',
        rawText: 'El paciente presenta dolor torácico.',
        sourceFilename: 'nota_es2.txt',
        language: 'es',
        phiStatus: 'deidentified',
      });

      const res = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          documentIds: [doc._id.toString()],
          modelBackend: 'mock', // Mock backend supports 'es'
        });

      expect(res.status).toBe(201);
      expect(res.body.job.modelBackend).toBe('mock');
    });
  });

  describe('4. Fact Verification Warning for Unsupported Verification Languages', () => {
    it('returns consistencyScore: null and verificationWarning for non-English verification', async () => {
      const pipeline = new VerificationPipeline();
      const chunks = [{ id: '1', text: 'El paciente no presenta dolor de cabeza.' }];
      const result = await pipeline.verify('El paciente no tiene dolor.', chunks, 'ehr_note', 'es');

      expect(result.consistencyScore).toBeNull();
      expect(result.verificationWarning).toContain("unavailable for language 'es'");
      expect(result.verificationWarning).toContain('Please review summary manually with extra caution');
    });
  });
});
