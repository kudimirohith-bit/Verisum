import { z } from 'zod';

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'verifying',
  'completed',
  'failed',
]);

export const CreateSummarizationJobSchema = z.object({
  documentIds: z.array(z.string()).min(1, 'At least one document ID is required'),
  modelBackend: z.string().default('local'),
});

export const SummarizationJobResponseSchema = z.object({
  id: z.string(),
  documentIds: z.array(z.string()),
  modelBackend: z.string(),
  status: JobStatusSchema,
  createdAt: z.date(),
  completedAt: z.date().nullable().optional(),
  updatedAt: z.date(),
});

export type CreateSummarizationJobInput = z.infer<typeof CreateSummarizationJobSchema>;
export type SummarizationJobResponse = z.infer<typeof SummarizationJobResponseSchema>;
