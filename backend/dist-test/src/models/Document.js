"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentModel = void 0;
const mongoose_1 = require("mongoose");
const DocumentSchema = new mongoose_1.Schema({
    ownerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    docType: {
        type: String,
        enum: [
            'ehr_note',
            'discharge_summary',
            'radiology_report',
            'dialogue_transcript',
            'biomedical_literature',
        ],
        required: true,
    },
    rawText: {
        type: String,
        required: true,
    },
    sourceFilename: {
        type: String,
        required: true,
    },
    language: {
        type: String,
        required: true,
        default: 'en',
    },
    uploadedAt: {
        type: Date,
        default: () => new Date(),
    },
    phiStatus: {
        type: String,
        enum: ['raw', 'deidentified', 'n/a'],
        required: true,
        default: 'raw',
    },
    collectionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'DocumentCollection',
        default: null,
    },
}, { timestamps: true });
// Index for fast lookup by owner
DocumentSchema.index({ ownerId: 1 });
exports.DocumentModel = (0, mongoose_1.model)('Document', DocumentSchema);
