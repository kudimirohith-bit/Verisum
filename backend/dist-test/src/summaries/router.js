"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summariesRouter = void 0;
const express_1 = require("express");
const Summary_js_1 = require("../models/Summary.js");
const SummarizationJob_js_1 = require("../models/SummarizationJob.js");
const Document_js_1 = require("../models/Document.js");
const ClinicianFeedback_js_1 = require("../models/ClinicianFeedback.js");
const middleware_js_1 = require("../auth/middleware.js");
const audit_js_1 = require("../auth/audit.js");
const router = (0, express_1.Router)();
exports.summariesRouter = router;
/**
 * GET /summaries/:id
 * Retrieves summary text, metadata, consistency score, flagged claims, and linked documents.
 */
router.get('/:id', middleware_js_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const summary = await Summary_js_1.SummaryModel.findById(id);
    if (!summary) {
        res.status(404).json({ error: 'NotFound', message: 'Summary not found.' });
        return;
    }
    const job = await SummarizationJob_js_1.SummarizationJobModel.findById(summary.jobId);
    const documents = job ? await Document_js_1.DocumentModel.find({ _id: { $in: job.documentIds } }) : [];
    const feedback = await ClinicianFeedback_js_1.ClinicianFeedbackModel.find({ summaryId: summary._id });
    res.json({
        summary,
        job,
        documents,
        feedback,
    });
});
/**
 * POST /summaries/:id/feedback
 * Clinicians/Admins submit structured feedback (1-5 ratings + comment) for a summary.
 */
router.post('/:id/feedback', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('clinician', 'admin'), async (req, res) => {
    const { id } = req.params;
    const summary = await Summary_js_1.SummaryModel.findById(id);
    if (!summary) {
        res.status(404).json({ error: 'NotFound', message: 'Summary not found.' });
        return;
    }
    const { completenessRating, correctnessRating, concisenessRating, comment } = req.body;
    const cNum = Number(completenessRating);
    const rNum = Number(correctnessRating);
    const sNum = Number(concisenessRating);
    if (!cNum || !rNum || !sNum || cNum < 1 || cNum > 5 || rNum < 1 || rNum > 5 || sNum < 1 || sNum > 5) {
        res.status(400).json({
            error: 'ValidationError',
            message: 'completenessRating, correctnessRating, and concisenessRating are required and must be between 1 and 5.',
        });
        return;
    }
    const reviewerId = req.user.sub;
    const feedback = await ClinicianFeedback_js_1.ClinicianFeedbackModel.findOneAndUpdate({ summaryId: summary._id, reviewerId }, {
        summaryId: summary._id,
        reviewerId,
        completenessRating: cNum,
        correctnessRating: rNum,
        concisenessRating: sNum,
        comment: comment ? String(comment).trim() : '',
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    // Emit audit log event
    await (0, audit_js_1.logEvent)({
        eventType: 'review',
        actorId: req.user.sub,
        summaryId: summary._id.toString(),
        jobId: summary.jobId ? summary.jobId.toString() : null,
        requestId: req.requestId,
        payload: {
            action: 'feedback_submitted',
            completenessRating: cNum,
            correctnessRating: rNum,
            concisenessRating: sNum,
            hasComment: Boolean(comment),
        },
    });
    res.status(201).json({
        message: 'Feedback submitted successfully.',
        feedback,
    });
});
/**
 * GET /summaries/:id/feedback
 * Retrieves all feedback entries for a summary.
 */
router.get('/:id/feedback', middleware_js_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const feedback = await ClinicianFeedback_js_1.ClinicianFeedbackModel.find({ summaryId: id });
    res.json({ feedback });
});
