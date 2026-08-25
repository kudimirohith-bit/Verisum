import { Router, Request, Response } from 'express';
import { AuditLogModel, AuditEventType } from '../models/AuditLog.js';
import { SummarizationJobModel } from '../models/SummarizationJob.js';
import { SummaryModel } from '../models/Summary.js';
import { ClinicianFeedbackModel } from '../models/ClinicianFeedback.js';
import { DocumentModel } from '../models/Document.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { AuditLogger } from './AuditLogger.js';

const router = Router();

/**
 * GET /audit
 * Retrieves paginated, filterable audit log entries.
 * Guards: Admin role only.
 */
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        eventType,
        actorId,
        documentId,
        jobId,
        summaryId,
        requestId,
        startDate,
        endDate,
        page = '1',
        limit = '20',
      } = req.query;

      const filter: Record<string, unknown> = {};

      if (eventType) filter.eventType = eventType as AuditEventType;
      if (actorId) filter.actorId = actorId;
      if (documentId) filter.documentId = documentId;
      if (jobId) filter.jobId = jobId;
      if (summaryId) filter.summaryId = summaryId;
      if (requestId) filter.requestId = requestId;

      if (startDate || endDate) {
        const dateFilter: Record<string, Date> = {};
        if (startDate) dateFilter.$gte = new Date(startDate as string);
        if (endDate) dateFilter.$lte = new Date(endDate as string);
        filter.createdAt = dateFilter;
      }

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const [logs, total] = await Promise.all([
        AuditLogModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        AuditLogModel.countDocuments(filter),
      ]);

      const pages = Math.ceil(total / limitNum) || 1;

      res.json({
        logs,
        total,
        page: pageNum,
        pages,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'AuditQueryError', message: err.message });
    }
  },
);

/**
 * GET /audit/export
 * Exports an audit snapshot in CSV or JSON format.
 * Guards: Admin role only.
 */
router.get(
  '/export',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { format = 'json', eventType, startDate, endDate } = req.query;
      const filter: Record<string, unknown> = {};

      if (eventType) filter.eventType = eventType as AuditEventType;
      if (startDate || endDate) {
        const dateFilter: Record<string, Date> = {};
        if (startDate) dateFilter.$gte = new Date(startDate as string);
        if (endDate) dateFilter.$lte = new Date(endDate as string);
        filter.createdAt = dateFilter;
      }

      const logs = await AuditLogModel.find(filter).sort({ createdAt: -1 }).lean();

      // Audit the export event
      await AuditLogger.log({
        eventType: 'export',
        actorId: req.user!.sub,
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
    } catch (err: any) {
      res.status(500).json({ error: 'AuditExportError', message: err.message });
    }
  },
);

/**
 * GET /audit/metrics
 * Returns aggregated benchmarking metrics for the admin dashboard.
 * Guards: Admin role only.
 */
router.get(
  '/metrics',
  requireAuth,
  requireRole('admin'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // 1. Volume of jobs over time (grouped by day)
      const volumeData = await SummarizationJobModel.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // 2. Average consistency score by modelBackend
      const consistencyData = await SummaryModel.aggregate([
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
      const feedbackData = await ClinicianFeedbackModel.aggregate([
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
      const flaggedClaimData = await SummaryModel.aggregate([
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
    } catch (err: any) {
      res.status(500).json({ error: 'AuditMetricsError', message: err.message });
    }
  },
);

export { router as auditRouter };
