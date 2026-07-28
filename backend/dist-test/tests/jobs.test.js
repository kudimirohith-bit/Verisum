"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
const supertest_1 = __importDefault(require("supertest"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const app_1 = require("../src/app");
const User_1 = require("../src/models/User");
const Document_1 = require("../src/models/Document");
const SummarizationJob_1 = require("../src/models/SummarizationJob");
const Summary_1 = require("../src/models/Summary");
const AuditLog_1 = require("../src/models/AuditLog");
const tokens_1 = require("../src/auth/tokens");
// ── Mock BullMQ Queue to run Worker processor inline in the test thread ───────
jest.mock('../src/jobs/queue', () => ({
    enqueueSummarizationJob: jest.fn().mockImplementation(async (jobId) => {
        // Run the worker processor function immediately and synchronously to process the job
        const { processSummarizationJob } = require('../src/jobs/processor');
        await processSummarizationJob(jobId);
    }),
}));
let mongod;
// ── DB lifecycle ───────────────────────────────────────────────────────────────
beforeAll(async () => {
    mongod = await mongodb_memory_server_1.MongoMemoryServer.create();
    await mongoose_1.default.connect(mongod.getUri());
});
afterAll(async () => {
    await mongoose_1.default.disconnect();
    await mongod.stop();
});
afterEach(async () => {
    const collections = mongoose_1.default.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});
// ── Helpers ────────────────────────────────────────────────────────────────────
async function createUser(email, role = 'clinician') {
    const hash = await bcryptjs_1.default.hash('testPass1!', 1);
    const user = await User_1.UserModel.create({ email, role, passwordHash: hash });
    const token = (0, tokens_1.signAccessToken)({ sub: user._id.toString(), email: user.email, role: user.role });
    return { user, token };
}
// ══════════════════════════════════════════════════════════════════════════════
// JOBS INTEGRATION TESTS
// ══════════════════════════════════════════════════════════════════════════════
describe('Summarization Jobs Integration Tests', () => {
    it('creates and completes a job for "mock", "local_clinical_model", and "hosted_llm"', async () => {
        const { token } = await createUser('clinician@jobs.io', 'clinician');
        // Seed a demo document
        const doc = await Document_1.DocumentModel.create({
            ownerId: new mongoose_1.default.Types.ObjectId(),
            docType: 'discharge_summary',
            rawText: 'Patient is a 55-year-old male admitted with chest pain. EKG showed sinus tachycardia. Cardiac enzymes were normal. Patient discharged home.',
            sourceFilename: 'ehr_demo.txt',
            phiStatus: 'deidentified',
        });
        const backends = ['mock', 'local_clinical_model', 'hosted_llm'];
        for (const backend of backends) {
            // 1. Submit the job
            const res = await (0, supertest_1.default)(app_1.app)
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
            // 2. Assert job status is updated to 'verifying' in the database (since our mock processed it inline)
            const jobDb = await SummarizationJob_1.SummarizationJobModel.findById(jobId);
            expect(jobDb).toBeDefined();
            expect(jobDb.status).toBe('verifying');
            expect(jobDb.completedAt).toBeDefined();
            // 3. Assert a Summary document was created with non-empty summaryText
            const summary = await Summary_1.SummaryModel.findOne({ jobId });
            expect(summary).toBeDefined();
            expect(summary.summaryText).not.toBe('');
            expect(summary.tokenCount).toBeGreaterThan(0);
            expect(summary.automaticMetrics).toBeDefined();
            expect(summary.automaticMetrics.modelName).toBeDefined();
            // Check modelName based on backend
            expect(summary.automaticMetrics.modelName).toBe(backend);
            // 4. Assert AuditLog entry was emitted
            const auditLog = await AuditLog_1.AuditLogModel.findOne({ jobId, eventType: 'summarize' });
            expect(auditLog).toBeDefined();
            expect(auditLog.payload.action).toBe('job_completed');
            expect(auditLog.payload.modelBackend).toBe(backend);
        }
    });
    it('fails if documentIds list is empty', async () => {
        const { token } = await createUser('clinician@jobs.io', 'clinician');
        const res = await (0, supertest_1.default)(app_1.app)
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
        const fakeId = new mongoose_1.default.Types.ObjectId().toString();
        const res = await (0, supertest_1.default)(app_1.app)
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
