"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSummarizationJob = processSummarizationJob;
const Document_js_1 = require("../../backend/src/models/Document.js");
const SummarizationJob_js_1 = require("../../backend/src/models/SummarizationJob.js");
const Summary_js_1 = require("../../backend/src/models/Summary.js");
const AuditLog_js_1 = require("../../backend/src/models/AuditLog.js");
const backends_js_1 = require("../../backend/src/summarizer/backends.js");
const HierarchicalSummarizer_js_1 = require("../../backend/src/chunking/HierarchicalSummarizer.js");
async function processSummarizationJob(jobId) {
    console.log(`[Worker Processor] Starting job ${jobId}`);
    // 1. Fetch the summarization job from database
    const job = await SummarizationJob_js_1.SummarizationJobModel.findById(jobId);
    if (!job) {
        console.error(`[Worker Processor] Job ${jobId} not found in database.`);
        throw new Error(`Job ${jobId} not found`);
    }
    // Update job status to running
    job.status = 'running';
    await job.save();
    const start = Date.now();
    try {
        // 2. Fetch the documents associated with the job
        const documents = await Document_js_1.DocumentModel.find({ _id: { $in: job.documentIds } });
        if (documents.length === 0) {
            throw new Error('No documents found for this job');
        }
        // Map to ChunkableDocument interface
        const chunkableDocs = documents.map((doc) => ({
            id: doc._id.toString(),
            text: doc.rawText,
        }));
        // 3. Resolve the configured summarizer backend
        const backend = backends_js_1.BackendRegistry.get(job.modelBackend);
        console.log(`[Worker Processor] Using summarizer backend: ${backend.name}`);
        // 4. Instantiate HierarchicalSummarizer with selected backend
        const overlapTokens = Math.max(5, Math.floor(backend.maxContextTokens * 0.1));
        const summarizer = new HierarchicalSummarizer_js_1.HierarchicalSummarizer({
            backend,
            overlapTokens,
        });
        // Use docType of first document as representative
        const docType = documents[0].docType || 'ehr_note';
        // 5. Run Hierarchical Summarization
        const result = await summarizer.summarizeDocuments(chunkableDocs, docType);
        const totalLatency = Date.now() - start;
        // 6. Persist the Summary document
        const summary = await Summary_js_1.SummaryModel.create({
            jobId: job._id,
            summaryText: result.finalSummary,
            tokenCount: backend.countTokens(result.finalSummary),
            automaticMetrics: {
                latencyMs: totalLatency,
                levelsUsed: result.levelsUsed,
                modelName: backend.name,
                modelVersion: '1.0.0',
                chunkSummaries: result.chunkSummaries,
            },
            consistencyScore: null,
            flaggedClaims: [],
        });
        // 7. Update job status to verifying
        job.status = 'verifying';
        job.completedAt = new Date();
        await job.save();
        // 8. Emit an AuditLog event
        await AuditLog_js_1.AuditLogModel.create({
            eventType: 'summarize',
            jobId: job._id,
            documentId: documents[0]._id,
            payload: {
                action: 'job_completed',
                modelBackend: job.modelBackend,
                latencyMs: totalLatency,
                levelsUsed: result.levelsUsed,
                summaryId: summary._id,
            },
        });
        console.log(`[Worker Processor] Job ${jobId} completed successfully.`);
        return { summaryId: summary._id };
    }
    catch (error) {
        console.error(`[Worker Processor] Job ${jobId} failed:`, error);
        job.status = 'failed';
        await job.save();
        // Emit error audit log
        await AuditLog_js_1.AuditLogModel.create({
            eventType: 'summarize',
            jobId: job._id,
            payload: {
                action: 'job_failed',
                error: error.message,
            },
        });
        throw error;
    }
}
