"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSummarizationJob = processSummarizationJob;
const Document_js_1 = require("../models/Document.js");
const SummarizationJob_js_1 = require("../models/SummarizationJob.js");
const Summary_js_1 = require("../models/Summary.js");
const AuditLogger_js_1 = require("../audit/AuditLogger.js");
const backends_js_1 = require("../summarizer/backends.js");
const HierarchicalSummarizer_js_1 = require("../chunking/HierarchicalSummarizer.js");
const index_js_1 = require("../verification/index.js");
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
        // 6. Persist the initial Summary document
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
        // 7. Update job status to verifying while verification module executes
        job.status = 'verifying';
        await job.save();
        // 8. Run Verification Pipeline (0.7 Factual Consistency & Hallucination Detection)
        const pipeline = new index_js_1.VerificationPipeline();
        const sourceChunks = chunkableDocs.map((d) => ({ id: d.id, text: d.text }));
        const verificationResult = await pipeline.verify(result.finalSummary, sourceChunks, docType);
        // Update Summary with verification metrics
        summary.consistencyScore = verificationResult.consistencyScore;
        summary.flaggedClaims = verificationResult.flaggedClaims;
        await summary.save();
        // 9. Update job status to completed after verification succeeds
        job.status = 'completed';
        job.completedAt = new Date();
        await job.save();
        // 10. Emit AuditLog events (both summarize and verify)
        await AuditLogger_js_1.AuditLogger.log({
            eventType: 'summarize',
            jobId: job._id.toString(),
            documentId: documents[0]._id.toString(),
            summaryId: summary._id.toString(),
            payload: {
                action: 'job_summarized',
                modelBackend: job.modelBackend,
                latencyMs: totalLatency,
                levelsUsed: result.levelsUsed,
            },
        });
        await AuditLogger_js_1.AuditLogger.log({
            eventType: 'verify',
            jobId: job._id.toString(),
            documentId: documents[0]._id.toString(),
            summaryId: summary._id.toString(),
            payload: {
                action: 'verification_completed',
                consistencyScore: verificationResult.consistencyScore,
                flaggedCount: verificationResult.flaggedClaims.length,
            },
        });
        console.log(`[Worker Processor] Job ${jobId} verification completed. Status: completed.`);
        return { summaryId: summary._id };
    }
    catch (error) {
        console.error(`[Worker Processor] Job ${jobId} failed:`, error);
        job.status = 'failed';
        await job.save();
        // Emit error audit log
        await AuditLogger_js_1.AuditLogger.log({
            eventType: 'summarize',
            jobId: job._id.toString(),
            payload: {
                action: 'job_failed',
                error: error.message,
            },
        });
        throw error;
    }
}
