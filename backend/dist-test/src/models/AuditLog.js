"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogModel = void 0;
const mongoose_1 = require("mongoose");
const AuditLogSchema = new mongoose_1.Schema({
    eventType: {
        type: String,
        enum: ['auth', 'upload', 'summarize', 'verify', 'review', 'export'],
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
    summaryId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Summary',
        default: null,
    },
    requestId: {
        type: String,
        default: null,
        index: true,
    },
    payload: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
}, { timestamps: true });
// Compound indexes for fast administrative filtering & auditing
AuditLogSchema.index({ eventType: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ documentId: 1 });
AuditLogSchema.index({ jobId: 1 });
// ── Immutability Enforcement ───────────────────────────────────────────────────
// Audit logs are append-only. Prevent update and delete mutations via Mongoose hooks.
const immutableError = () => new Error('Audit logs are immutable and cannot be updated or deleted.');
AuditLogSchema.pre('updateOne', function (next) {
    next(immutableError());
});
AuditLogSchema.pre('findOneAndUpdate', function (next) {
    next(immutableError());
});
AuditLogSchema.pre('deleteOne', function (next) {
    next(immutableError());
});
AuditLogSchema.pre('deleteMany', function (next) {
    if (process.env.NODE_ENV === 'test') {
        return next();
    }
    next(immutableError());
});
exports.AuditLogModel = (0, mongoose_1.model)('AuditLog', AuditLogSchema);
