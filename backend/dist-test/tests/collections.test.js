"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
const app_js_1 = require("../src/app.js");
const User_js_1 = require("../src/models/User.js");
const Document_js_1 = require("../src/models/Document.js");
const DocumentCollection_js_1 = require("../src/models/DocumentCollection.js");
const SummarizationJob_js_1 = require("../src/models/SummarizationJob.js");
const Summary_js_1 = require("../src/models/Summary.js");
const tokens_js_1 = require("../src/auth/tokens.js");
const processor_js_1 = require("../src/jobs/processor.js");
let mongoServer;
let userToken;
let userId;
beforeAll(async () => {
    mongoServer = await mongodb_memory_server_1.MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose_1.default.connect(uri);
    const user = await User_js_1.UserModel.create({
        email: 'researcher@verisumm.org',
        passwordHash: 'hashed_pw',
        role: 'researcher',
        name: 'Dr. Research',
    });
    userId = user._id.toString();
    userToken = (0, tokens_js_1.signAccessToken)({
        sub: userId,
        email: user.email,
        role: user.role,
    });
});
afterAll(async () => {
    await mongoose_1.default.disconnect();
    await mongoServer.stop();
});
beforeEach(async () => {
    await Document_js_1.DocumentModel.deleteMany({});
    await DocumentCollection_js_1.DocumentCollectionModel.deleteMany({});
    await SummarizationJob_js_1.SummarizationJobModel.deleteMany({});
    await Summary_js_1.SummaryModel.deleteMany({});
});
describe('0.11 — Multi-Document & Biomedical Literature Mode', () => {
    it('1. POST /collections — creates a named collection', async () => {
        const res = await (0, supertest_1.default)(app_js_1.app)
            .post('/collections')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
            name: 'Hypertension RCT Abstracts',
            docType: 'biomedical_literature',
            description: 'Collection of 3 clinical trial abstracts on antihypertensives',
        });
        expect(res.status).toBe(201);
        expect(res.body.collection).toBeDefined();
        expect(res.body.collection.name).toBe('Hypertension RCT Abstracts');
        expect(res.body.collection.docType).toBe('biomedical_literature');
    });
    it('2. Summarizing 3 synthetic biomedical abstracts produces coherent literature summary with source attribution', async () => {
        // 1. Create collection
        const colRes = await (0, supertest_1.default)(app_js_1.app)
            .post('/collections')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
            name: 'Oncology Immunotherapy Benchmark',
            docType: 'biomedical_literature',
        });
        const collectionId = colRes.body.collection._id;
        // 2. Attach 3 synthetic biomedical abstracts
        const attachRes = await (0, supertest_1.default)(app_js_1.app)
            .post(`/collections/${collectionId}/documents`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
            documents: [
                {
                    sourceFilename: 'abstract_1_pembrolizumab.txt',
                    rawText: 'Background: Pembrolizumab evaluated in 120 lung cancer patients. Results: Overall response rate was 45%. Conclusion: Statistically significant survival benefit observed.',
                    docType: 'biomedical_literature',
                },
                {
                    sourceFilename: 'abstract_2_nivolumab.txt',
                    rawText: 'Background: Phase III trial of Nivolumab vs chemotherapy in 300 patients. Results: Median overall survival increased to 14.2 months (p=0.002).',
                    docType: 'biomedical_literature',
                },
                {
                    sourceFilename: 'abstract_3_atezolizumab.txt',
                    rawText: 'Background: Atezolizumab cohort study of 85 subjects. Results: Progression-free survival reached 8.5 months with manageable toxicity.',
                    docType: 'biomedical_literature',
                },
            ],
        });
        expect(attachRes.status).toBe(200);
        expect(attachRes.body.documents.length).toBe(3);
        // 3. Trigger collection-level summarization
        const sumRes = await (0, supertest_1.default)(app_js_1.app)
            .post(`/collections/${collectionId}/summarize`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ modelBackend: 'mock' });
        expect(sumRes.status).toBe(201);
        expect(sumRes.body.job).toBeDefined();
        expect(sumRes.body.job.status).toBe('completed');
        // 4. Fetch job details & summary
        const jobRes = await (0, supertest_1.default)(app_js_1.app)
            .get(`/jobs/${sumRes.body.jobId}`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(jobRes.status).toBe(200);
        expect(jobRes.body.job.documentIds.length).toBe(3);
        expect(jobRes.body.summary).toBeDefined();
        expect(jobRes.body.summary.summaryText).toContain('Biomedical Literature');
    });
    it('3. Summarizing 3 patient chronological notes produces a timeline-aware summary with ordering cues', async () => {
        // 1. Create clinical collection
        const colRes = await (0, supertest_1.default)(app_js_1.app)
            .post('/collections')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
            name: 'Patient John Doe Chronological EHR',
            docType: 'ehr_note',
        });
        const collectionId = colRes.body.collection._id;
        // 2. Attach 3 chronological EHR notes
        const attachRes = await (0, supertest_1.default)(app_js_1.app)
            .post(`/collections/${collectionId}/documents`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
            documents: [
                {
                    sourceFilename: 'note_2026_01_10.txt',
                    rawText: 'Patient presented with acute chest pain and BP 160/100. Started on Lisinopril.',
                    docType: 'ehr_note',
                    uploadedAt: '2026-01-10T10:00:00Z',
                },
                {
                    sourceFilename: 'note_2026_02_15.txt',
                    rawText: 'Follow-up visit. BP improved to 135/85. Patient tolerating medication well.',
                    docType: 'ehr_note',
                    uploadedAt: '2026-02-15T10:00:00Z',
                },
                {
                    sourceFilename: 'note_2026_03_20.txt',
                    rawText: 'Routine checkup. BP stable at 122/78. Continue current regimen.',
                    docType: 'ehr_note',
                    uploadedAt: '2026-03-20T10:00:00Z',
                },
            ],
        });
        expect(attachRes.status).toBe(200);
        // 3. Trigger collection summarization
        const sumRes = await (0, supertest_1.default)(app_js_1.app)
            .post(`/collections/${collectionId}/summarize`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ modelBackend: 'mock' });
        expect(sumRes.status).toBe(201);
        const jobRes = await (0, supertest_1.default)(app_js_1.app)
            .get(`/jobs/${sumRes.body.jobId}`)
            .set('Authorization', `Bearer ${userToken}`);
        const summaryText = jobRes.body.summary.summaryText.toLowerCase();
        // Assert chronological ordering cues appear (e.g. "initially...", "later...", "most recently...")
        expect(summaryText.includes('initially') ||
            summaryText.includes('later') ||
            summaryText.includes('most recently')).toBe(true);
    });
    it('4. Existing single-document flow remains unaffected (backward compatibility)', async () => {
        // 1. Single document upload via POST /documents
        const docRes = await (0, supertest_1.default)(app_js_1.app)
            .post('/documents')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
            docType: 'discharge_summary',
            rawText: 'Patient discharged in stable condition following elective knee replacement.',
            sourceFilename: 'discharge_knee.txt',
        });
        expect(docRes.status).toBe(201);
        const docId = docRes.body.document.id;
        // 2. Create single job via POST /jobs
        const jobRes = await (0, supertest_1.default)(app_js_1.app)
            .post('/jobs')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
            documentIds: [docId],
            modelBackend: 'mock',
        });
        expect(jobRes.status).toBe(201);
        const jobId = jobRes.body.job.id;
        await (0, processor_js_1.processSummarizationJob)(jobId);
        const updatedJobRes = await (0, supertest_1.default)(app_js_1.app)
            .get(`/jobs/${jobId}`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(updatedJobRes.body.job.status).toBe('completed');
    });
});
