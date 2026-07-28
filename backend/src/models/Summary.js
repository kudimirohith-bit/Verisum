"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummaryModel = void 0;
const mongoose_1 = require("mongoose");
const FlaggedClaimSchema = new mongoose_1.Schema({
    claimText: { type: String, required: true },
    startOffset: { type: Number, required: true },
    endOffset: { type: Number, required: true },
    reason: { type: String },
}, { _id: false });
const SummarySchema = new mongoose_1.Schema({
    jobId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'SummarizationJob',
        required: true,
    },
    summaryText: {
        type: String,
        required: true,
    },
    tokenCount: {
        type: Number,
        required: true,
        default: 0,
    },
    automaticMetrics: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    consistencyScore: {
        type: Number,
        default: null,
    },
    flaggedClaims: {
        type: [FlaggedClaimSchema],
        default: [],
    },
}, { timestamps: true });
exports.SummaryModel = (0, mongoose_1.model)('Summary', SummarySchema);
