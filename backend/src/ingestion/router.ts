import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { z } from 'zod';
import { DocumentModel } from '../models/Document.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { logEvent } from '../auth/audit.js';
import { extractText, SUPPORTED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from './extractor.js';
import { deidentify } from '../deid/index.js';
import type { DocType } from '../models/Document.js';

// ── Multer configuration — memory storage, no disk persistence ─────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext && ['.txt', '.pdf', '.docx'].map((e) => e.slice(1)).includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`));
    }
  },
});

// ── Zod validation ─────────────────────────────────────────────────────────────
const DocTypeSchema = z.enum([
  'ehr_note',
  'discharge_summary',
  'radiology_report',
  'dialogue_transcript',
  'biomedical_literature',
]);

const UploadBodySchema = z.object({
  docType: DocTypeSchema,
  rawText: z.string().optional(), // for pasted text (no file)
});

// ── Router ─────────────────────────────────────────────────────────────────────
const router = Router();

/**
 * POST /documents
 * Accepts either:
 *   a) multipart file upload (field name: "file") + docType form field
 *   b) JSON body with { docType, rawText } for pasted text
 *
 * Guards: authenticated clinician or researcher
 */
router.post(
  '/',
  requireAuth,
  requireRole('clinician', 'researcher', 'admin'),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    // ── Validate body ────────────────────────────────────────────────────────
    const parsed = UploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
      return;
    }

    const { docType, rawText: pastedText } = parsed.data;
    const file = req.file;

    if (!file && !pastedText) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Provide either a file upload (field: "file") or a "rawText" body field.',
      });
      return;
    }

    // ── Extract text ─────────────────────────────────────────────────────────
    let extractedText: string;
    let sourceFilename: string;

    try {
      if (file) {
        extractedText = await extractText(file.buffer, file.originalname);
        sourceFilename = file.originalname;
        // Buffer is in-memory only — never hits disk as raw PHI
      } else {
        extractedText = pastedText!;
        sourceFilename = `paste_${Date.now()}.txt`;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Text extraction failed.';
      res.status(422).json({ error: 'ExtractionError', message });
      return;
    }

    // ── De-identify ──────────────────────────────────────────────────────────
    let deidResult;
    try {
      deidResult = await deidentify(extractedText);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'De-identification failed.';
      res.status(500).json({ error: 'DeidentificationError', message });
      return;
    }

    // ── Persist de-identified document (never persists raw PHI) ─────────────
    const document = await DocumentModel.create({
      ownerId: req.user!.sub,
      docType: docType as DocType,
      rawText: deidResult.deidentifiedText, // de-identified only
      sourceFilename,
      phiStatus: 'deidentified',
      uploadedAt: new Date(),
    });

    // ── Emit audit log ────────────────────────────────────────────────────────
    await logEvent({
      eventType: 'upload',
      actorId: req.user!.sub,
      documentId: document._id.toString(),
      requestId: req.requestId,
      payload: {
        docType,
        sourceFilename,
        phiMatchCount: deidResult.phiMatchCount,
        phiTagsSummary: [...new Set(deidResult.matchedTags)],
        fileSize: file?.size ?? extractedText.length,
      },
    });

    res.status(201).json({
      message: 'Document uploaded and de-identified successfully.',
      document: {
        id: document._id,
        ownerId: document.ownerId,
        docType: document.docType,
        sourceFilename: document.sourceFilename,
        phiStatus: document.phiStatus,
        uploadedAt: document.uploadedAt,
        phiMatchCount: deidResult.phiMatchCount,
      },
    });
  },
);

/**
 * GET /documents/:id
 * Returns document metadata + de-identified text.
 * Admin with explicit "raw-view" query param emits an audited response
 * (still returns de-identified text — raw PHI is never persisted).
 *
 * Guards: authenticated (any role)
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const document = await DocumentModel.findById(id);

  if (!document) {
    res.status(404).json({ error: 'NotFound', message: 'Document not found.' });
    return;
  }

  // Non-admin users can only view their own documents
  const isAdmin = req.user!.role === 'admin';
  const isOwner = document.ownerId.toString() === req.user!.sub;

  if (!isAdmin && !isOwner) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to view this document.',
    });
    return;
  }

  // Audit admin "raw view" requests
  if (isAdmin && req.query['raw-view'] === 'true') {
    await logEvent({
      eventType: 'verify',
      actorId: req.user!.sub,
      documentId: document._id.toString(),
      payload: { action: 'admin_raw_view_request', note: 'Raw PHI not stored; returning deid text.' },
    });
  }

  res.json({
    document: {
      id: document._id,
      ownerId: document.ownerId,
      docType: document.docType,
      rawText: document.rawText, // always de-identified — raw PHI never persisted
      sourceFilename: document.sourceFilename,
      phiStatus: document.phiStatus,
      uploadedAt: document.uploadedAt,
      createdAt: document.createdAt,
    },
  });
});

/**
 * GET /documents
 * Lists documents owned by the requesting user (admins see all).
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const isAdmin = req.user!.role === 'admin';
  const filter = isAdmin ? {} : { ownerId: req.user!.sub };

  const documents = await DocumentModel.find(filter)
    .select('-rawText') // exclude large text field from listings
    .sort({ uploadedAt: -1 })
    .lean();

  res.json({ documents });
});

export { router as ingestionRouter };
