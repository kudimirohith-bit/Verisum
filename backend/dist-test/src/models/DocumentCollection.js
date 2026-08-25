"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentCollectionModel = void 0;
const mongoose_1 = require("mongoose");
const DocumentCollectionSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
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
        default: 'biomedical_literature',
    },
    description: {
        type: String,
        default: '',
    },
}, { timestamps: true });
DocumentCollectionSchema.index({ ownerId: 1, name: 1 });
exports.DocumentCollectionModel = (0, mongoose_1.model)('DocumentCollection', DocumentCollectionSchema);
