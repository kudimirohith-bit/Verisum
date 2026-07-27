import { z } from 'zod';

export const AuditEventTypeSchema = z.enum([
  'upload',
  'summarize',
  'verify',
  'review',
  'export',
]);

export const CreateAuditLogSchema = z.object({
  eventType: AuditEventTypeSchema,
  actorId: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  payload: z.record(z.unknown()).default({}),
});

export const AuditLogResponseSchema = z.object({
  id: z.string(),
  eventType: AuditEventTypeSchema,
  actorId: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  payload: z.record(z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateAuditLogInput = z.infer<typeof CreateAuditLogSchema>;
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;
