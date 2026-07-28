"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentResponseSchema = exports.CreateDocumentSchema = exports.PhiStatusSchema = exports.DocTypeSchema = void 0;
const zod_1 = require("zod");
exports.DocTypeSchema = zod_1.z.enum([
    'ehr_note',
    'discharge_summary',
    'radiology_report',
    'dialogue_transcript',
    'biomedical_literature',
]);
exports.PhiStatusSchema = zod_1.z.enum(['raw', 'deidentified', 'n/a']);
exports.CreateDocumentSchema = zod_1.z.object({
    docType: exports.DocTypeSchema,
    rawText: zod_1.z.string().min(1, 'Document text cannot be empty'),
    sourceFilename: zod_1.z.string().min(1, 'Source filename is required'),
    phiStatus: exports.PhiStatusSchema.default('raw'),
    collectionId: zod_1.z.string().optional().nullable(),
});
exports.DocumentResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    ownerId: zod_1.z.string(),
    docType: exports.DocTypeSchema,
    sourceFilename: zod_1.z.string(),
    uploadedAt: zod_1.z.date(),
    phiStatus: exports.PhiStatusSchema,
    collectionId: zod_1.z.string().nullable().optional(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
