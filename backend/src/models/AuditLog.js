"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogModel = void 0;
const mongoose_1 = require("mongoose");
const AuditLogSchema = new mongoose_1.Schema({
    eventType: {
        type: String,
        enum: ['upload', 'summarize', 'verify', 'review', 'export'],
        required: true,
    },
    actorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    documentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Document',
        default: null,
    },
    jobId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'SummarizationJob',
        default: null,
    },
    payload: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
}, { timestamps: true });
// Compound index on eventType + createdAt for audit trail queries
AuditLogSchema.index({ eventType: 1, createdAt: -1 });
exports.AuditLogModel = (0, mongoose_1.model)('AuditLog', AuditLogSchema);
