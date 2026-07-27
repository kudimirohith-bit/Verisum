import { z } from 'zod';

export const CreateClinicianFeedbackSchema = z.object({
  summaryId: z.string(),
  completenessRating: z.number().int().min(1).max(5),
  correctnessRating: z.number().int().min(1).max(5),
  concisenessRating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const ClinicianFeedbackResponseSchema = z.object({
  id: z.string(),
  summaryId: z.string(),
  reviewerId: z.string(),
  completenessRating: z.number(),
  correctnessRating: z.number(),
  concisenessRating: z.number(),
  comment: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateClinicianFeedbackInput = z.infer<typeof CreateClinicianFeedbackSchema>;
export type ClinicianFeedbackResponse = z.infer<typeof ClinicianFeedbackResponseSchema>;
