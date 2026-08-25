"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
const mongoose_1 = __importDefault(require("mongoose"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app_js_1 = require("../src/app.js");
const User_js_1 = require("../src/models/User.js");
const Document_js_1 = require("../src/models/Document.js");
const DocumentCollection_js_1 = require("../src/models/DocumentCollection.js");
const tokens_js_1 = require("../src/auth/tokens.js");
const secrets_js_1 = require("../src/config/secrets.js");
const deployment_js_1 = require("../src/config/deployment.js");
let mongoServer;
let adminToken;
let clinicianToken;
let testDocId;
let testCollectionId;
describe('0.12 — Deployment, Self-Hosting & Security Hardening (Deployment Mode & Secrets)', () => {
    beforeAll(async () => {
        mongoServer = await mongodb_memory_server_1.MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose_1.default.connect(uri);
        const adminUser = await User_js_1.UserModel.create({
            email: 'admin@verisumm.org',
            passwordHash: 'hash',
            role: 'admin',
        });
        const clinicianUser = await User_js_1.UserModel.create({
            email: 'doc@verisumm.org',
            passwordHash: 'hash',
            role: 'clinician',
        });
        adminToken = (0, tokens_js_1.signAccessToken)({
            sub: adminUser._id.toString(),
            email: adminUser.email,
            role: adminUser.role,
        });
        clinicianToken = (0, tokens_js_1.signAccessToken)({
            sub: clinicianUser._id.toString(),
            email: clinicianUser.email,
            role: clinicianUser.role,
        });
        const doc = await Document_js_1.DocumentModel.create({
            ownerId: clinicianUser._id.toString(),
            docType: 'ehr_note',
            rawText: 'Patient presents with hypertension. BP 140/90. Prescribed Lisinopril.',
            sourceFilename: 'note1.txt',
        });
        testDocId = doc._id.toString();
        const collection = await DocumentCollection_js_1.DocumentCollectionModel.create({
            name: 'Test Offline Collection',
            ownerId: clinicianUser._id.toString(),
            docType: 'ehr_note',
        });
        testCollectionId = collection._id.toString();
    });
    afterAll(async () => {
        await mongoose_1.default.disconnect();
        await mongoServer.stop();
    });
    describe('Secrets Management Helper', () => {
        it('reads standard environment variables', () => {
            process.env.TEST_SECRET_KEY = 'my-secret-val';
            expect((0, secrets_js_1.getSecret)('TEST_SECRET_KEY')).toBe('my-secret-val');
            delete process.env.TEST_SECRET_KEY;
        });
        it('supports reading secrets from a mounted file (_FILE suffix)', () => {
            const tmpSecretFile = path_1.default.join(__dirname, 'tmp_secret.txt');
            fs_1.default.writeFileSync(tmpSecretFile, 'file-mounted-secret-content\n', 'utf-8');
            process.env.TEST_FILE_SECRET_FILE = tmpSecretFile;
            expect((0, secrets_js_1.getSecret)('TEST_FILE_SECRET')).toBe('file-mounted-secret-content');
            // Cleanup
            delete process.env.TEST_FILE_SECRET_FILE;
            if (fs_1.default.existsSync(tmpSecretFile))
                fs_1.default.unlinkSync(tmpSecretFile);
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
            expect((0, deployment_js_1.getDeploymentMode)()).toBe('offline');
            expect((0, deployment_js_1.validateBackendAccess)('hosted_llm').allowed).toBe(false);
            expect((0, deployment_js_1.validateBackendAccess)('local_clinical_model').allowed).toBe(true);
            expect((0, deployment_js_1.validateBackendAccess)('mock').allowed).toBe(true);
        });
        it('rejects POST /jobs with hosted_llm with 403 Forbidden', async () => {
            const res = await (0, supertest_1.default)(app_js_1.app)
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
            const res = await (0, supertest_1.default)(app_js_1.app)
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
            const res = await (0, supertest_1.default)(app_js_1.app)
                .post(`/collections/${testCollectionId}/summarize`)
                .set('Authorization', `Bearer ${clinicianToken}`)
                .send({
                modelBackend: 'hosted_llm',
            });
            expect(res.status).toBe(403);
            expect(res.body.message).toContain('Hosted LLM backend is disabled in offline deployment mode.');
        });
        it('rejects POST /benchmark/run including hosted_llm in offline mode with 403', async () => {
            const res = await (0, supertest_1.default)(app_js_1.app)
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
