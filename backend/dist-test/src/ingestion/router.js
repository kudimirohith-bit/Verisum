"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const Document_js_1 = require("../models/Document.js");
const middleware_js_1 = require("../auth/middleware.js");
const audit_js_1 = require("../auth/audit.js");
const extractor_js_1 = require("./extractor.js");
const index_js_1 = require("../deid/index.js");
const languageDetector_js_1 = require("../deid/languageDetector.js");
const deployment_js_1 = require("../config/deployment.js");
// ── Multer configuration — memory storage, no disk persistence ─────────────────
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: extractor_js_1.MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        const ext = file.originalname.split('.').pop()?.toLowerCase();
        if (ext && ['.txt', '.pdf', '.docx'].map((e) => e.slice(1)).includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Unsupported file type. Allowed: ${extractor_js_1.SUPPORTED_EXTENSIONS.join(', ')}`));
        }
    },
});
// ── Zod validation ─────────────────────────────────────────────────────────────
const DocTypeSchema = zod_1.z.enum([
    'ehr_note',
    'discharge_summary',
    'radiology_report',
    'dialogue_transcript',
    'biomedical_literature',
]);
const UploadBodySchema = zod_1.z.object({
    docType: DocTypeSchema,
    rawText: zod_1.z.string().optional(), // for pasted text (no file)
});
// ── Router ─────────────────────────────────────────────────────────────────────
const router = (0, express_1.Router)();
exports.ingestionRouter = router;
/**
 * POST /documents
 * Accepts either:
 *   a) multipart file upload (field name: "file") + docType form field
 *   b) JSON body with { docType, rawText } for pasted text
 *
 * Guards: authenticated clinician or researcher
 */
router.post('/', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('clinician', 'researcher', 'admin'), upload.single('file'), async (req, res) => {
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
    let extractedText;
    let sourceFilename;
    try {
        if (file) {
            extractedText = await (0, extractor_js_1.extractText)(file.buffer, file.originalname);
            sourceFilename = file.originalname;
            // Buffer is in-memory only — never hits disk as raw PHI
        }
        else {
            extractedText = pastedText;
            sourceFilename = `paste_${Date.now()}.txt`;
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Text extraction failed.';
        res.status(422).json({ error: 'ExtractionError', message });
        return;
    }
    // ── Detect Language & Fail-Closed Security Policy ─────────────────────────
    const langResult = (0, languageDetector_js_1.detectLanguage)(extractedText);
    const detectedLang = langResult.language;
    const deploymentMode = (0, deployment_js_1.getDeploymentMode)();
    const requireValidatedDeid = process.env.REQUIRE_VALIDATED_DEID === 'true' || deploymentMode !== 'offline';
    if (requireValidatedDeid && !(0, languageDetector_js_1.isLanguageSupportedForDeid)(detectedLang)) {
        res.status(422).json({
            error: 'DEID_UNSUPPORTED_LANGUAGE',
            message: `De-identification pipeline is not validated for language '${detectedLang}'. Document ingestion blocked under current deployment configuration.`,
            detectedLanguage: detectedLang,
        });
        return;
    }
    // ── De-identify ──────────────────────────────────────────────────────────
    let deidResult;
    try {
        deidResult = await (0, index_js_1.deidentify)(extractedText);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'De-identification failed.';
        res.status(500).json({ error: 'DeidentificationError', message });
        return;
    }
    // ── Persist de-identified document (never persists raw PHI) ─────────────
    const document = await Document_js_1.DocumentModel.create({
        ownerId: req.user.sub,
        docType: docType,
        rawText: deidResult.deidentifiedText, // de-identified only
        sourceFilename,
        language: detectedLang,
        phiStatus: 'deidentified',
        uploadedAt: new Date(),
    });
    // ── Emit audit log ────────────────────────────────────────────────────────
    await (0, audit_js_1.logEvent)({
        eventType: 'upload',
        actorId: req.user.sub,
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
});
/**
 * GET /documents/:id
 * Returns document metadata + de-identified text.
 * Admin with explicit "raw-view" query param emits an audited response
 * (still returns de-identified text — raw PHI is never persisted).
 *
 * Guards: authenticated (any role)
 */
router.get('/:id', middleware_js_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const document = await Document_js_1.DocumentModel.findById(id);
    if (!document) {
        res.status(404).json({ error: 'NotFound', message: 'Document not found.' });
        return;
    }
    // Non-admin users can only view their own documents
    const isAdmin = req.user.role === 'admin';
    const isOwner = document.ownerId.toString() === req.user.sub;
    if (!isAdmin && !isOwner) {
        res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have permission to view this document.',
        });
        return;
    }
    // Audit admin "raw view" requests
    if (isAdmin && req.query['raw-view'] === 'true') {
        await (0, audit_js_1.logEvent)({
            eventType: 'verify',
            actorId: req.user.sub,
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
router.get('/', middleware_js_1.requireAuth, async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const filter = isAdmin ? {} : { ownerId: req.user.sub };
    const documents = await Document_js_1.DocumentModel.find(filter)
        .select('-rawText') // exclude large text field from listings
        .sort({ uploadedAt: -1 })
        .lean();
    res.json({ documents });
});
