"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClinicianFeedbackModel = void 0;
const mongoose_1 = require("mongoose");
const ClinicianFeedbackSchema = new mongoose_1.Schema({
    summaryId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Summary',
        required: true,
    },
    reviewerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    completenessRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
    correctnessRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
    concisenessRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
    comment: {
        type: String,
        trim: true,
    },
}, { timestamps: true });
exports.ClinicianFeedbackModel = (0, mongoose_1.model)('ClinicianFeedback', ClinicianFeedbackSchema);
