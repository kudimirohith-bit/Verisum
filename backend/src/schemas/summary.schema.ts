import { z } from 'zod';

export const FlaggedClaimSchema = z.object({
  claimText: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  reason: z.string().optional(),
});

export const CreateSummarySchema = z.object({
  jobId: z.string(),
  summaryText: z.string().min(1, 'Summary text cannot be empty'),
  tokenCount: z.number().int().nonnegative().default(0),
  automaticMetrics: z.record(z.unknown()).default({}),
  consistencyScore: z.number().min(0).max(1).nullable().optional(),
  flaggedClaims: z.array(FlaggedClaimSchema).default([]),
});

export const SummaryResponseSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  summaryText: z.string(),
  tokenCount: z.number(),
  automaticMetrics: z.record(z.unknown()),
  consistencyScore: z.number().nullable().optional(),
  flaggedClaims: z.array(FlaggedClaimSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type FlaggedClaim = z.infer<typeof FlaggedClaimSchema>;
export type CreateSummaryInput = z.infer<typeof CreateSummarySchema>;
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;
