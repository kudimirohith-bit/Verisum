import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { StudyModel } from '../models/Study.js';
import { SummarizationJobModel } from '../models/SummarizationJob.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { computeStudyResults } from './runner.js';
import { logEvent } from '../auth/audit.js';
import { getErrorMessage } from '../utils/errors.js';

const router = Router();

const CreateStudySchema = z.object({
  name: z.string().min(1, 'Study name is required'),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  enrolledBackends: z.array(z.string()).min(1, 'At least one model backend must be enrolled'),
  enrolledDocTypes: z.array(z.string()).default([]),
  primaryOutcomeMetric: z.string().default('clinician_time_saved'),
});

const EnrollDocumentSchema = z.object({
  documentId: z.string().optional(),
  jobId: z.string().optional(),
});

/**
 * POST /studies
 * Creates a prospective research study.
 * Guards: Clinician, Researcher, Admin roles.
 */
router.post(
  '/',
  requireAuth,
  requireRole('clinician', 'researcher', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateStudySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
      return;
    }

    const {
      name,
      description,
      startDate,
      endDate,
      enrolledBackends,
      enrolledDocTypes,
      primaryOutcomeMetric,
    } = parsed.data;

    const study = await StudyModel.create({
      name,
      description,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
      enrolledBackends,
      enrolledDocTypes,
      primaryOutcomeMetric,
      createdBy: req.user!.sub,
    });

    await logEvent({
      eventType: 'study_created',
      actorId: req.user!.sub,
      requestId: req.requestId,
      payload: {
        studyId: study._id.toString(),
        name: study.name,
        enrolledBackends: study.enrolledBackends,
      },
    });

    res.status(201).json({
      message: 'Study created successfully.',
      study,
    });
  },
);

/**
 * GET /studies
 * Lists all research studies.
 */
router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const studies = await StudyModel.find().sort({ createdAt: -1 }).lean();
  res.json({ studies });
});

/**
 * GET /studies/:id
 * Retrieves study details.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const study = await StudyModel.findById(id);
  if (!study) {
    res.status(404).json({ error: 'NotFound', message: 'Study not found.' });
    return;
  }

  const enrolledJobCount = await SummarizationJobModel.countDocuments({ studyId: study._id });

  res.json({
    study,
    enrolledJobCount,
  });
});

/**
 * POST /studies/:id/enroll-document
 * Enrolls a Document or SummarizationJob into the specified study.
 */
router.post(
  '/:id/enroll-document',
  requireAuth,
  requireRole('clinician', 'researcher', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const study = await StudyModel.findById(id);
    if (!study) {
      res.status(404).json({ error: 'NotFound', message: 'Study not found.' });
      return;
    }

    const parsed = EnrollDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
      return;
    }

    const { documentId, jobId } = parsed.data;
    if (!documentId && !jobId) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Provide either a documentId or a jobId to enroll.',
      });
      return;
    }

    let updatedCount = 0;

    if (jobId) {
      const job = await SummarizationJobModel.findById(jobId);
      if (job) {
        job.studyId = study._id;
        await job.save();
        updatedCount++;
      }
    }

    if (documentId) {
      // Find all jobs associated with this documentId
      const jobs = await SummarizationJobModel.find({ documentIds: documentId });
      for (const j of jobs) {
        j.studyId = study._id;
        await j.save();
        updatedCount++;
      }
    }

    res.json({
      message: `Enrolled ${updatedCount} job(s) into study '${study.name}'.`,
      studyId: study._id,
      enrolledJobsCount: updatedCount,
    });
  },
);

/**
 * GET /studies/:id/results
 * Aggregates outcomes and metrics for the prospective research study.
 */
router.get(
  '/:id/results',
  requireAuth,
  requireRole('clinician', 'researcher', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const results = await computeStudyResults(id);
      res.json({ results });
    } catch (err: unknown) {
      res.status(404).json({ error: 'NotFound', message: getErrorMessage(err) });
    }
  },
);

export { router as studiesRouter };
