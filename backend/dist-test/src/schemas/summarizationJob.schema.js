"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummarizationJobResponseSchema = exports.CreateSummarizationJobSchema = exports.JobStatusSchema = void 0;
const zod_1 = require("zod");
exports.JobStatusSchema = zod_1.z.enum([
    'queued',
    'running',
    'verifying',
    'completed',
    'failed',
]);
exports.CreateSummarizationJobSchema = zod_1.z.object({
    documentIds: zod_1.z.array(zod_1.z.string()).min(1, 'At least one document ID is required'),
    modelBackend: zod_1.z.string().default('local'),
});
exports.SummarizationJobResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    documentIds: zod_1.z.array(zod_1.z.string()),
    modelBackend: zod_1.z.string(),
    status: exports.JobStatusSchema,
    createdAt: zod_1.z.date(),
    completedAt: zod_1.z.date().nullable().optional(),
    updatedAt: zod_1.z.date(),
});
