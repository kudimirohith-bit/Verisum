import { z } from 'zod';

export const DocTypeSchema = z.enum([
  'ehr_note',
  'discharge_summary',
  'radiology_report',
  'dialogue_transcript',
  'biomedical_literature',
]);

export const PhiStatusSchema = z.enum(['raw', 'deidentified', 'n/a']);

export const CreateDocumentSchema = z.object({
  docType: DocTypeSchema,
  rawText: z.string().min(1, 'Document text cannot be empty'),
  sourceFilename: z.string().min(1, 'Source filename is required'),
  phiStatus: PhiStatusSchema.default('raw'),
  collectionId: z.string().optional().nullable(),
});

export const DocumentResponseSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  docType: DocTypeSchema,
  sourceFilename: z.string(),
  uploadedAt: z.date(),
  phiStatus: PhiStatusSchema,
  collectionId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;
