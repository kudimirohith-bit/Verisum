"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRouter = void 0;
const express_1 = require("express");
const AuditLog_js_1 = require("../models/AuditLog.js");
const SummarizationJob_js_1 = require("../models/SummarizationJob.js");
const Summary_js_1 = require("../models/Summary.js");
const ClinicianFeedback_js_1 = require("../models/ClinicianFeedback.js");
const middleware_js_1 = require("../auth/middleware.js");
const AuditLogger_js_1 = require("./AuditLogger.js");
const router = (0, express_1.Router)();
exports.auditRouter = router;
/**
 * GET /audit
 * Retrieves paginated, filterable audit log entries.
 * Guards: Admin role only.
 */
router.get('/', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('admin'), async (req, res) => {
    try {
        const { eventType, actorId, documentId, jobId, summaryId, requestId, startDate, endDate, page = '1', limit = '20', } = req.query;
        const filter = {};
        if (eventType)
            filter.eventType = eventType;
        if (actorId)
            filter.actorId = actorId;
        if (documentId)
            filter.documentId = documentId;
        if (jobId)
            filter.jobId = jobId;
        if (summaryId)
            filter.summaryId = summaryId;
        if (requestId)
            filter.requestId = requestId;
        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate)
                dateFilter.$gte = new Date(startDate);
            if (endDate)
                dateFilter.$lte = new Date(endDate);
            filter.createdAt = dateFilter;
        }
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const [logs, total] = await Promise.all([
            AuditLog_js_1.AuditLogModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            AuditLog_js_1.AuditLogModel.countDocuments(filter),
        ]);
        const pages = Math.ceil(total / limitNum) || 1;
        res.json({
            logs,
            total,
            page: pageNum,
            pages,
        });
    }
    catch (err) {
        res.status(500).json({ error: 'AuditQueryError', message: err.message });
    }
});
/**
 * GET /audit/export
 * Exports an audit snapshot in CSV or JSON format.
 * Guards: Admin role only.
 */
router.get('/export', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('admin'), async (req, res) => {
    try {
        const { format = 'json', eventType, startDate, endDate } = req.query;
        const filter = {};
        if (eventType)
            filter.eventType = eventType;
        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate)
                dateFilter.$gte = new Date(startDate);
            if (endDate)
                dateFilter.$lte = new Date(endDate);
            filter.createdAt = dateFilter;
        }
        const logs = await AuditLog_js_1.AuditLogModel.find(filter).sort({ createdAt: -1 }).lean();
        // Audit the export event
        await AuditLogger_js_1.AuditLogger.log({
            eventType: 'export',
            actorId: req.user.sub,
            payload: {
                exportFormat: format,
                recordCount: logs.length,
                filterApplied: filter,
            },
        });
        if (String(format).toLowerCase() === 'csv') {
            const headers = ['id', 'eventType', 'actorId', 'documentId', 'jobId', 'summaryId', 'requestId', 'createdAt', 'payload'];
            const csvRows = [headers.join(',')];
            for (const log of logs) {
                const row = [
                    log._id.toString(),
                    log.eventType,
                    log.actorId ? log.actorId.toString() : '',
                    log.documentId ? log.documentId.toString() : '',
                    log.jobId ? log.jobId.toString() : '',
                    log.summaryId ? log.summaryId.toString() : '',
                    log.requestId || '',
                    new Date(log.createdAt).toISOString(),
                    `"${JSON.stringify(log.payload || {}).replace(/"/g, '""')}"`,
                ];
                csvRows.push(row.join(','));
            }
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="verisumm_audit_export.csv"');
            res.send(csvRows.join('\n'));
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="verisumm_audit_export.json"');
        res.json(logs);
    }
    catch (err) {
        res.status(500).json({ error: 'AuditExportError', message: err.message });
    }
});
/**
 * GET /audit/metrics
 * Returns aggregated benchmarking metrics for the admin dashboard.
 * Guards: Admin role only.
 */
router.get('/metrics', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('admin'), async (_req, res) => {
    try {
        // 1. Volume of jobs over time (grouped by day)
        const volumeData = await SummarizationJob_js_1.SummarizationJobModel.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);
        // 2. Average consistency score by modelBackend
        const consistencyData = await Summary_js_1.SummaryModel.aggregate([
            {
                $lookup: {
                    from: 'summarizationjobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'job',
                },
            },
            { $unwind: '$job' },
            {
                $group: {
                    _id: '$job.modelBackend',
                    avgConsistencyScore: { $avg: '$consistencyScore' },
                    totalSummaries: { $sum: 1 },
                },
            },
        ]);
        // 3. Average clinician ratings by modelBackend
        const feedbackData = await ClinicianFeedback_js_1.ClinicianFeedbackModel.aggregate([
            {
                $lookup: {
                    from: 'summaries',
                    localField: 'summaryId',
                    foreignField: '_id',
                    as: 'summary',
                },
            },
            { $unwind: '$summary' },
            {
                $lookup: {
                    from: 'summarizationjobs',
                    localField: 'summary.jobId',
                    foreignField: '_id',
                    as: 'job',
                },
            },
            { $unwind: '$job' },
            {
                $group: {
                    _id: '$job.modelBackend',
                    avgCompleteness: { $avg: '$completenessRating' },
                    avgCorrectness: { $avg: '$correctnessRating' },
                    avgConciseness: { $avg: '$concisenessRating' },
                    totalReviews: { $sum: 1 },
                },
            },
        ]);
        // 4. Flagged claim rate by docType
        const flaggedClaimData = await Summary_js_1.SummaryModel.aggregate([
            {
                $lookup: {
                    from: 'summarizationjobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'job',
                },
            },
            { $unwind: '$job' },
            {
                $lookup: {
                    from: 'documents',
                    localField: 'job.documentIds',
                    foreignField: '_id',
                    as: 'documents',
                },
            },
            { $unwind: '$documents' },
            {
                $group: {
                    _id: '$documents.docType',
                    totalSummaries: { $sum: 1 },
                    flaggedCount: {
                        $sum: {
                            $cond: [{ $gt: [{ $size: { $ifNull: ['$flaggedClaims', []] } }, 0] }, 1, 0],
                        },
                    },
                },
            },
            {
                $project: {
                    docType: '$_id',
                    totalSummaries: 1,
                    flaggedCount: 1,
                    flaggedRate: {
                        $cond: [
                            { $gt: ['$totalSummaries', 0] },
                            { $divide: ['$flaggedCount', '$totalSummaries'] },
                            0,
                        ],
                    },
                },
            },
        ]);
        res.json({
            volumeOverTime: volumeData.map((d) => ({ date: d._id, count: d.count })),
            avgConsistencyByBackend: consistencyData.map((d) => ({
                modelBackend: d._id,
                avgConsistencyScore: d.avgConsistencyScore !== null ? Number(d.avgConsistencyScore.toFixed(3)) : 0,
                totalSummaries: d.totalSummaries,
            })),
            avgFeedbackByBackend: feedbackData.map((d) => ({
                modelBackend: d._id,
                avgCompleteness: Number(d.avgCompleteness.toFixed(2)),
                avgCorrectness: Number(d.avgCorrectness.toFixed(2)),
                avgConciseness: Number(d.avgConciseness.toFixed(2)),
                totalReviews: d.totalReviews,
            })),
            flaggedClaimRateByDocType: flaggedClaimData.map((d) => ({
                docType: d._id,
                totalSummaries: d.totalSummaries,
                flaggedCount: d.flaggedCount,
                flaggedRate: Number((d.flaggedRate * 100).toFixed(1)),
            })),
        });
    }
    catch (err) {
        res.status(500).json({ error: 'AuditMetricsError', message: err.message });
    }
});
