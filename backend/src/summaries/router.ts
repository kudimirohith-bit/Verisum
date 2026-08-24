import { Router, Request, Response } from 'express';
import { SummaryModel } from '../models/Summary.js';
import { SummarizationJobModel } from '../models/SummarizationJob.js';
import { DocumentModel } from '../models/Document.js';
import { ClinicianFeedbackModel } from '../models/ClinicianFeedback.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { logEvent } from '../auth/audit.js';

const router = Router();

/**
 * GET /summaries/:id
 * Retrieves summary text, metadata, consistency score, flagged claims, and linked documents.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const summary = await SummaryModel.findById(id);

  if (!summary) {
    res.status(404).json({ error: 'NotFound', message: 'Summary not found.' });
    return;
  }

  const job = await SummarizationJobModel.findById(summary.jobId);
  const documents = job ? await DocumentModel.find({ _id: { $in: job.documentIds } }) : [];
  const feedback = await ClinicianFeedbackModel.find({ summaryId: summary._id });

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
router.post(
  '/:id/feedback',
  requireAuth,
  requireRole('clinician', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const summary = await SummaryModel.findById(id);

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

    const reviewerId = req.user!.sub;

    const feedback = await ClinicianFeedbackModel.findOneAndUpdate(
      { summaryId: summary._id, reviewerId },
      {
        summaryId: summary._id,
        reviewerId,
        completenessRating: cNum,
        correctnessRating: rNum,
        concisenessRating: sNum,
        comment: comment ? String(comment).trim() : '',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Emit audit log event
    await logEvent({
      eventType: 'review',
      actorId: reviewerId,
      payload: {
        action: 'submit_feedback',
        summaryId: summary._id.toString(),
        completenessRating: cNum,
        correctnessRating: rNum,
        concisenessRating: sNum,
      },
    });

    res.status(201).json({
      message: 'Feedback submitted successfully.',
      feedback,
    });
  },
);

/**
 * GET /summaries/:id/feedback
 * Retrieves all feedback entries for a summary.
 */
router.get('/:id/feedback', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const feedback = await ClinicianFeedbackModel.find({ summaryId: id });
  res.json({ feedback });
});

export { router as summariesRouter };
