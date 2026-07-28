"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_js_1 = require("../src/models/User.js");
const Document_js_1 = require("../src/models/Document.js");
const SummarizationJob_js_1 = require("../src/models/SummarizationJob.js");
const Summary_js_1 = require("../src/models/Summary.js");
const ClinicianFeedback_js_1 = require("../src/models/ClinicianFeedback.js");
const AuditLog_js_1 = require("../src/models/AuditLog.js");
let mongod;
beforeAll(async () => {
    mongod = await mongodb_memory_server_1.MongoMemoryServer.create();
    await mongoose_1.default.connect(mongod.getUri());
});
afterAll(async () => {
    await mongoose_1.default.disconnect();
    await mongod.stop();
});
afterEach(async () => {
    // Clean up between tests to keep them isolated
    const collections = mongoose_1.default.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// User Model Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('User model', () => {
    it('creates a user with required fields', async () => {
        const hash = await bcryptjs_1.default.hash('secret123', 10);
        const user = await User_js_1.UserModel.create({
            email: 'test@verisumm.io',
            role: 'clinician',
            passwordHash: hash,
        });
        expect(user._id).toBeDefined();
        expect(user.email).toBe('test@verisumm.io');
        expect(user.role).toBe('clinician');
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);
    });
    it('enforces unique email constraint', async () => {
        const hash = await bcryptjs_1.default.hash('secret123', 10);
        await User_js_1.UserModel.create({ email: 'dup@verisumm.io', role: 'admin', passwordHash: hash });
        await expect(User_js_1.UserModel.create({ email: 'dup@verisumm.io', role: 'clinician', passwordHash: hash })).rejects.toThrow();
    });
    it('rejects invalid roles', async () => {
        const hash = await bcryptjs_1.default.hash('secret123', 10);
        await expect(User_js_1.UserModel.create({ email: 'bad@verisumm.io', role: 'superuser', passwordHash: hash })).rejects.toThrow();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// Document Model Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Document model', () => {
    it('creates a document and populates ownerId ref', async () => {
        const hash = await bcryptjs_1.default.hash('pass', 10);
        const owner = await User_js_1.UserModel.create({ email: 'owner@test.io', role: 'clinician', passwordHash: hash });
        const doc = await Document_js_1.DocumentModel.create({
            ownerId: owner._id,
            docType: 'discharge_summary',
            rawText: 'Patient presented with chest pain...',
            sourceFilename: 'note.txt',
            phiStatus: 'deidentified',
        });
        const populated = await Document_js_1.DocumentModel.findById(doc._id).populate('ownerId');
        expect(populated).not.toBeNull();
        expect(populated.ownerId.email).toBe('owner@test.io');
        expect(doc.phiStatus).toBe('deidentified');
        expect(doc.collectionId).toBeNull();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// SummarizationJob Model Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('SummarizationJob model', () => {
    it('creates a job with queued status and documentIds', async () => {
        const hash = await bcryptjs_1.default.hash('pass', 10);
        const owner = await User_js_1.UserModel.create({ email: 'jobowner@test.io', role: 'researcher', passwordHash: hash });
        const doc = await Document_js_1.DocumentModel.create({
            ownerId: owner._id,
            docType: 'ehr_note',
            rawText: 'Clinical note text',
            sourceFilename: 'ehr.txt',
            phiStatus: 'raw',
        });
        const job = await SummarizationJob_js_1.SummarizationJobModel.create({
            documentIds: [doc._id],
            modelBackend: 'local-biobart',
            status: 'queued',
        });
        expect(job.status).toBe('queued');
        expect(job.documentIds).toHaveLength(1);
        expect(job.documentIds[0].toString()).toBe(doc._id.toString());
        expect(job.completedAt).toBeNull();
    });
    it('populates documentIds refs correctly', async () => {
        const hash = await bcryptjs_1.default.hash('pass', 10);
        const owner = await User_js_1.UserModel.create({ email: 'pop@test.io', role: 'clinician', passwordHash: hash });
        const doc = await Document_js_1.DocumentModel.create({
            ownerId: owner._id,
            docType: 'radiology_report',
            rawText: 'X-ray report...',
            sourceFilename: 'xray.txt',
            phiStatus: 'deidentified',
        });
        const job = await SummarizationJob_js_1.SummarizationJobModel.create({
            documentIds: [doc._id],
            modelBackend: 'hosted-gpt4',
            status: 'running',
        });
        const populated = await SummarizationJob_js_1.SummarizationJobModel.findById(job._id).populate('documentIds');
        expect(populated.documentIds[0].sourceFilename).toBe('xray.txt');
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// Summary Model Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Summary model', () => {
    it('creates a summary and populates jobId ref', async () => {
        const hash = await bcryptjs_1.default.hash('pass', 10);
        const owner = await User_js_1.UserModel.create({ email: 'sum@test.io', role: 'clinician', passwordHash: hash });
        const doc = await Document_js_1.DocumentModel.create({
            ownerId: owner._id,
            docType: 'biomedical_literature',
            rawText: 'Abstract of biomedical paper...',
            sourceFilename: 'paper.txt',
            phiStatus: 'n/a',
        });
        const job = await SummarizationJob_js_1.SummarizationJobModel.create({
            documentIds: [doc._id],
            modelBackend: 'local',
            status: 'completed',
            completedAt: new Date(),
        });
        const summary = await Summary_js_1.SummaryModel.create({
            jobId: job._id,
            summaryText: 'The study found significant improvements in patient outcomes...',
            tokenCount: 48,
            automaticMetrics: { rouge1: 0.45, bertscore_f1: 0.82 },
            consistencyScore: 0.91,
            flaggedClaims: [],
        });
        const populated = await Summary_js_1.SummaryModel.findById(summary._id).populate('jobId');
        expect(populated.jobId.status).toBe('completed');
        expect(summary.tokenCount).toBe(48);
        expect(summary.consistencyScore).toBe(0.91);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// ClinicianFeedback Model Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('ClinicianFeedback model', () => {
    it('creates feedback and populates summaryId + reviewerId', async () => {
        const hash = await bcryptjs_1.default.hash('pass', 10);
        const reviewer = await User_js_1.UserModel.create({ email: 'reviewer@test.io', role: 'clinician', passwordHash: hash });
        const owner = await User_js_1.UserModel.create({ email: 'docowner@test.io', role: 'researcher', passwordHash: hash });
        const doc = await Document_js_1.DocumentModel.create({
            ownerId: owner._id,
            docType: 'ehr_note',
            rawText: 'Note...',
            sourceFilename: 'n.txt',
            phiStatus: 'raw',
        });
        const job = await SummarizationJob_js_1.SummarizationJobModel.create({
            documentIds: [doc._id],
            modelBackend: 'local',
            status: 'completed',
        });
        const summary = await Summary_js_1.SummaryModel.create({
            jobId: job._id,
            summaryText: 'Short summary',
            tokenCount: 10,
            automaticMetrics: {},
        });
        const feedback = await ClinicianFeedback_js_1.ClinicianFeedbackModel.create({
            summaryId: summary._id,
            reviewerId: reviewer._id,
            completenessRating: 4,
            correctnessRating: 5,
            concisenessRating: 3,
            comment: 'Good summary overall.',
        });
        const populated = await ClinicianFeedback_js_1.ClinicianFeedbackModel.findById(feedback._id)
            .populate('summaryId')
            .populate('reviewerId');
        expect(populated.summaryId.summaryText).toBe('Short summary');
        expect(populated.reviewerId.email).toBe('reviewer@test.io');
        expect(feedback.completenessRating).toBe(4);
    });
    it('rejects ratings outside 1-5', async () => {
        const hash = await bcryptjs_1.default.hash('pass', 10);
        const reviewer = await User_js_1.UserModel.create({ email: 'bad@rater.io', role: 'clinician', passwordHash: hash });
        const owner = await User_js_1.UserModel.create({ email: 'own2@test.io', role: 'clinician', passwordHash: hash });
        const doc = await Document_js_1.DocumentModel.create({ ownerId: owner._id, docType: 'ehr_note', rawText: 'x', sourceFilename: 'x.txt', phiStatus: 'raw' });
        const job = await SummarizationJob_js_1.SummarizationJobModel.create({ documentIds: [doc._id], modelBackend: 'local', status: 'queued' });
        const summary = await Summary_js_1.SummaryModel.create({ jobId: job._id, summaryText: 'x', tokenCount: 1, automaticMetrics: {} });
        await expect(ClinicianFeedback_js_1.ClinicianFeedbackModel.create({
            summaryId: summary._id,
            reviewerId: reviewer._id,
            completenessRating: 10, // out of range
            correctnessRating: 5,
            concisenessRating: 1,
        })).rejects.toThrow();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// AuditLog Model Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('AuditLog model', () => {
    it('creates an audit log with eventType and payload', async () => {
        const hash = await bcryptjs_1.default.hash('pass', 10);
        const actor = await User_js_1.UserModel.create({ email: 'auditor@test.io', role: 'admin', passwordHash: hash });
        const log = await AuditLog_js_1.AuditLogModel.create({
            eventType: 'upload',
            actorId: actor._id,
            payload: { filename: 'sample.txt', size: 1024 },
        });
        expect(log.eventType).toBe('upload');
        expect(log.payload).toMatchObject({ filename: 'sample.txt' });
        expect(log.actorId?.toString()).toBe(actor._id.toString());
        expect(log.jobId).toBeNull();
    });
    it('rejects invalid eventTypes', async () => {
        await expect(AuditLog_js_1.AuditLogModel.create({
            eventType: 'delete', // not in enum
            payload: {},
        })).rejects.toThrow();
    });
});
