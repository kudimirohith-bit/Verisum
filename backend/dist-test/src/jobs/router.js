"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRouter = void 0;
const express_1 = require("express");
const summarizationJob_schema_js_1 = require("../schemas/summarizationJob.schema.js");
const SummarizationJob_js_1 = require("../models/SummarizationJob.js");
const Document_js_1 = require("../models/Document.js");
const middleware_js_1 = require("../auth/middleware.js");
const queue_js_1 = require("./queue.js");
const audit_js_1 = require("../auth/audit.js");
const router = (0, express_1.Router)();
exports.jobsRouter = router;
/**
 * POST /jobs
 * Enqueues a new summarization job.
 * Guards: Clinician or Researcher roles.
 */
router.post('/', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('clinician', 'researcher', 'admin'), async (req, res) => {
    const parsed = summarizationJob_schema_js_1.CreateSummarizationJobSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
        return;
    }
    const { documentIds, modelBackend } = parsed.data;
    // Validate that all documentIds exist in database
    const documents = await Document_js_1.DocumentModel.find({ _id: { $in: documentIds } });
    if (documents.length !== documentIds.length) {
        res.status(404).json({
            error: 'NotFound',
            message: 'One or more of the specified documents do not exist.',
        });
        return;
    }
    // Create the job
    const job = await SummarizationJob_js_1.SummarizationJobModel.create({
        documentIds,
        modelBackend,
        status: 'queued',
    });
    // Enqueue the job onto BullMQ
    try {
        await (0, queue_js_1.enqueueSummarizationJob)(job._id.toString());
    }
    catch (err) {
        // Rollback job creation on enqueue failure
        await SummarizationJob_js_1.SummarizationJobModel.findByIdAndDelete(job._id);
        res.status(500).json({
            error: 'QueueError',
            message: `Failed to enqueue summarization job: ${err.message}`,
        });
        return;
    }
    // Audit log
    await (0, audit_js_1.logEvent)({
        eventType: 'summarize',
        actorId: req.user.sub,
        jobId: job._id.toString(),
        documentId: job.documentIds[0]?.toString(),
        requestId: req.requestId,
        payload: {
            action: 'job_created',
            modelBackend,
            documentCount: job.documentIds.length,
        },
    });
    res.status(201).json({
        message: 'Summarization job enqueued successfully.',
        job: {
            id: job._id,
            documentIds: job.documentIds,
            modelBackend: job.modelBackend,
            status: job.status,
            createdAt: job.createdAt,
        },
    });
});
const Summary_js_1 = require("../models/Summary.js");
const ClinicianFeedback_js_1 = require("../models/ClinicianFeedback.js");
/**
 * GET /jobs/:id
 * Retrieves a summarization job status along with summary and document details if available.
 * Guards: Authenticated.
 */
router.get('/:id', middleware_js_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const job = await SummarizationJob_js_1.SummarizationJobModel.findById(id);
    if (!job) {
        res.status(404).json({ error: 'NotFound', message: 'Job not found.' });
        return;
    }
    const documents = await Document_js_1.DocumentModel.find({ _id: { $in: job.documentIds } });
    const summary = await Summary_js_1.SummaryModel.findOne({ jobId: job._id });
    const feedback = summary ? await ClinicianFeedback_js_1.ClinicianFeedbackModel.find({ summaryId: summary._id }) : [];
    res.json({
        job: {
            id: job._id,
            documentIds: job.documentIds,
            modelBackend: job.modelBackend,
            status: job.status,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
        },
        documents,
        summary,
        feedback,
    });
});
