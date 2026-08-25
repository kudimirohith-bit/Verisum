import { Router, Request, Response } from 'express';
import { CreateSummarizationJobSchema } from '../schemas/summarizationJob.schema.js';
import { SummarizationJobModel } from '../models/SummarizationJob.js';
import { DocumentModel } from '../models/Document.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { enqueueSummarizationJob } from './queue.js';
import { logEvent } from '../auth/audit.js';

const router = Router();

/**
 * POST /jobs
 * Enqueues a new summarization job.
 * Guards: Clinician or Researcher roles.
 */
router.post(
  '/',
  requireAuth,
  requireRole('clinician', 'researcher', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateSummarizationJobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
      return;
    }

    const { documentIds, modelBackend } = parsed.data;

    // Validate that all documentIds exist in database
    const documents = await DocumentModel.find({ _id: { $in: documentIds } });
    if (documents.length !== documentIds.length) {
      res.status(404).json({
        error: 'NotFound',
        message: 'One or more of the specified documents do not exist.',
      });
      return;
    }

    // Create the job
    const job = await SummarizationJobModel.create({
      documentIds,
      modelBackend,
      status: 'queued',
    });

    // Enqueue the job onto BullMQ
    try {
      await enqueueSummarizationJob(job._id.toString());
    } catch (err: any) {
      // Rollback job creation on enqueue failure
      await SummarizationJobModel.findByIdAndDelete(job._id);
      res.status(500).json({
        error: 'QueueError',
        message: `Failed to enqueue summarization job: ${err.message}`,
      });
      return;
    }

    // Audit log
    await logEvent({
      eventType: 'summarize',
      actorId: req.user!.sub,
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
  },
);

import { SummaryModel } from '../models/Summary.js';
import { ClinicianFeedbackModel } from '../models/ClinicianFeedback.js';

/**
 * GET /jobs/:id
 * Retrieves a summarization job status along with summary and document details if available.
 * Guards: Authenticated.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const job = await SummarizationJobModel.findById(id);

  if (!job) {
    res.status(404).json({ error: 'NotFound', message: 'Job not found.' });
    return;
  }

  const documents = await DocumentModel.find({ _id: { $in: job.documentIds } });
  const summary = await SummaryModel.findOne({ jobId: job._id });
  const feedback = summary ? await ClinicianFeedbackModel.find({ summaryId: summary._id }) : [];

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

export { router as jobsRouter };
