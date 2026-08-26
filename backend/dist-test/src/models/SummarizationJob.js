"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummarizationJobModel = void 0;
const mongoose_1 = require("mongoose");
const SummarizationJobSchema = new mongoose_1.Schema({
    documentIds: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Document',
            required: true,
        },
    ],
    collectionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'DocumentCollection',
        default: null,
    },
    studyId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Study',
        default: null,
    },
    modelBackend: {
        type: String,
        required: true,
        default: 'local',
    },
    status: {
        type: String,
        enum: ['queued', 'running', 'verifying', 'completed', 'failed'],
        required: true,
        default: 'queued',
    },
    completedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });
// Index on status for job queue polling
SummarizationJobSchema.index({ status: 1 });
exports.SummarizationJobModel = (0, mongoose_1.model)('SummarizationJob', SummarizationJobSchema);
