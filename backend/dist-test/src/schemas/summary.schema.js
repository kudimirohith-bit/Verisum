"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummaryResponseSchema = exports.CreateSummarySchema = exports.FlaggedClaimSchema = void 0;
const zod_1 = require("zod");
exports.FlaggedClaimSchema = zod_1.z.object({
    claimText: zod_1.z.string().min(1),
    startOffset: zod_1.z.number().int().nonnegative(),
    endOffset: zod_1.z.number().int().nonnegative(),
    reason: zod_1.z.string().optional(),
});
exports.CreateSummarySchema = zod_1.z.object({
    jobId: zod_1.z.string(),
    summaryText: zod_1.z.string().min(1, 'Summary text cannot be empty'),
    tokenCount: zod_1.z.number().int().nonnegative().default(0),
    automaticMetrics: zod_1.z.record(zod_1.z.unknown()).default({}),
    consistencyScore: zod_1.z.number().min(0).max(1).nullable().optional(),
    flaggedClaims: zod_1.z.array(exports.FlaggedClaimSchema).default([]),
});
exports.SummaryResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    jobId: zod_1.z.string(),
    summaryText: zod_1.z.string(),
    tokenCount: zod_1.z.number(),
    automaticMetrics: zod_1.z.record(zod_1.z.unknown()),
    consistencyScore: zod_1.z.number().nullable().optional(),
    flaggedClaims: zod_1.z.array(exports.FlaggedClaimSchema),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
