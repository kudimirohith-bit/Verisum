"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogResponseSchema = exports.CreateAuditLogSchema = exports.AuditEventTypeSchema = void 0;
const zod_1 = require("zod");
exports.AuditEventTypeSchema = zod_1.z.enum([
    'upload',
    'summarize',
    'verify',
    'review',
    'export',
]);
exports.CreateAuditLogSchema = zod_1.z.object({
    eventType: exports.AuditEventTypeSchema,
    actorId: zod_1.z.string().nullable().optional(),
    documentId: zod_1.z.string().nullable().optional(),
    jobId: zod_1.z.string().nullable().optional(),
    payload: zod_1.z.record(zod_1.z.unknown()).default({}),
});
exports.AuditLogResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    eventType: exports.AuditEventTypeSchema,
    actorId: zod_1.z.string().nullable().optional(),
    documentId: zod_1.z.string().nullable().optional(),
    jobId: zod_1.z.string().nullable().optional(),
    payload: zod_1.z.record(zod_1.z.unknown()),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
