"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClinicianFeedbackResponseSchema = exports.CreateClinicianFeedbackSchema = void 0;
const zod_1 = require("zod");
exports.CreateClinicianFeedbackSchema = zod_1.z.object({
    summaryId: zod_1.z.string(),
    completenessRating: zod_1.z.number().int().min(1).max(5),
    correctnessRating: zod_1.z.number().int().min(1).max(5),
    concisenessRating: zod_1.z.number().int().min(1).max(5),
    comment: zod_1.z.string().optional(),
});
exports.ClinicianFeedbackResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    summaryId: zod_1.z.string(),
    reviewerId: zod_1.z.string(),
    completenessRating: zod_1.z.number(),
    correctnessRating: zod_1.z.number(),
    concisenessRating: zod_1.z.number(),
    comment: zod_1.z.string().optional(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
