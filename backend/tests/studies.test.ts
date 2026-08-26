import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app.js';
import { StudyModel } from '../src/models/Study.js';
import { DocumentModel } from '../src/models/Document.js';
import { SummarizationJobModel } from '../src/models/SummarizationJob.js';
import { SummaryModel } from '../src/models/Summary.js';
import { ClinicianFeedbackModel } from '../src/models/ClinicianFeedback.js';
import { UserModel } from '../src/models/User.js';
import { signAccessToken } from '../src/auth/tokens.js';

let mongoServer: MongoMemoryServer;
let researcherToken: string;
let clinicianToken: string;
let researcherId: string;
let clinicianId: string;

describe('0.15 — Prospective Evaluation / Study Mode Integration Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const researcher = await UserModel.create({
      email: 'researcher_study@verisumm.org',
      passwordHash: 'hashed_pw',
      fullName: 'Dr. Research Lead',
      role: 'researcher',
    });
    researcherId = researcher._id.toString();
    researcherToken = signAccessToken({
      sub: researcherId,
      email: researcher.email,
      role: researcher.role,
    });

    const clinician = await UserModel.create({
      email: 'clinician_study@verisumm.org',
      passwordHash: 'hashed_pw',
      fullName: 'Dr. Alex Clinician',
      role: 'clinician',
    });
    clinicianId = clinician._id.toString();
    clinicianToken = signAccessToken({
      sub: clinicianId,
      email: clinician.email,
      role: clinician.role,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('1. Study Lifecycle & Registration', () => {
    it('allows researchers to create a prospective evaluation study', async () => {
      const res = await request(app)
        .post('/studies')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          name: 'Prospective Discharge Note Efficiency Study',
          description: 'Comparing ClinicalT5 vs Hosted LLM on time-saved and accuracy.',
          enrolledBackends: ['local_clinical_model', 'hosted_llm'],
          enrolledDocTypes: ['discharge_summary'],
          primaryOutcomeMetric: 'clinician_time_saved',
        });

      expect(res.status).toBe(201);
      expect(res.body.study.name).toBe('Prospective Discharge Note Efficiency Study');
      expect(res.body.study.enrolledBackends).toEqual(['local_clinical_model', 'hosted_llm']);
    });

    it('retrieves study metadata and list', async () => {
      const study = await StudyModel.findOne({ name: 'Prospective Discharge Note Efficiency Study' });
      expect(study).not.toBeNull();

      const listRes = await request(app)
        .post('/studies')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          name: 'Secondary Study',
          enrolledBackends: ['mock'],
        });
      expect(listRes.status).toBe(201);

      const getRes = await request(app)
        .get(`/studies/${study!._id.toString()}`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.study.name).toBe('Prospective Discharge Note Efficiency Study');
      expect(getRes.body.enrolledJobCount).toBe(0);
    });
  });

  describe('2. Job Enrollment & Time-on-Task Instrument Evaluation', () => {
    it('enrolls a job into study and records time-on-task feedback', async () => {
      const study = await StudyModel.findOne({ name: 'Prospective Discharge Note Efficiency Study' });

      // Create document, job, summary
      const doc = await DocumentModel.create({
        ownerId: clinicianId,
        docType: 'discharge_summary',
        rawText: 'Patient was discharged in stable condition after 5 days.',
        sourceFilename: 'discharge_note.txt',
        phiStatus: 'deidentified',
      });

      const job = await SummarizationJobModel.create({
        documentIds: [doc._id],
        modelBackend: 'local_clinical_model',
        status: 'completed',
      });

      const summary = await SummaryModel.create({
        jobId: job._id,
        summaryText: 'Discharged stable post 5-day stay.',
        tokenCount: 8,
        consistencyScore: 0.95,
        flaggedClaims: [],
        automaticMetrics: { modelName: 'local_clinical_model', latencyMs: 320 },
      });

      // Enroll job into study
      const enrollRes = await request(app)
        .post(`/studies/${study!._id.toString()}/enroll-document`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({ jobId: job._id.toString() });

      expect(enrollRes.status).toBe(200);
      expect(enrollRes.body.enrolledJobsCount).toBe(1);

      // Submit feedback with timeOnTaskMs instrumentation
      const fbRes = await request(app)
        .post(`/summaries/${summary._id.toString()}/feedback`)
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          completenessRating: 5,
          correctnessRating: 5,
          concisenessRating: 4,
          comment: 'Accurate summary, time saved ~2 mins.',
          timeOnTaskMs: 45000, // 45 seconds
          studyId: study!._id.toString(),
        });

      expect(fbRes.status).toBe(201);
      expect(fbRes.body.feedback.timeOnTaskMs).toBe(45000);
    });
  });

  describe('3. Prospective Study Results Export', () => {
    it('aggregates outcomes per backend including mean time-on-task and markdown report', async () => {
      const study = await StudyModel.findOne({ name: 'Prospective Discharge Note Efficiency Study' });

      const resultsRes = await request(app)
        .get(`/studies/${study!._id.toString()}/results`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(resultsRes.status).toBe(200);
      const data = resultsRes.body.results;

      expect(data.studyName).toBe('Prospective Discharge Note Efficiency Study');
      expect(data.totalJobsEnrolled).toBe(1);

      const localResult = data.backendResults.find((r: any) => r.modelBackend === 'local_clinical_model');
      expect(localResult).toBeDefined();
      expect(localResult.processedDocumentCount).toBe(1);
      expect(localResult.meanConsistencyScore).toBe(0.95);
      expect(localResult.meanClinicianOverall).toBe(4.67); // (5+5+4)/3
      expect(localResult.meanTimeOnTaskSeconds).toBe(45.0);
      expect(localResult.flaggedClaimRate).toBe(0);

      expect(data.markdownReport).toContain('VeriSum Prospective Evaluation Study Report');
      expect(data.markdownReport).toContain('local_clinical_model');
    });
  });
});
