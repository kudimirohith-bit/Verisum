"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BenchmarkRunModel = void 0;
const mongoose_1 = require("mongoose");
const BackendBenchmarkResultSchema = new mongoose_1.Schema({
    modelBackend: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    avgRouge1: { type: Number, required: true, default: 0 },
    avgRouge2: { type: Number, required: true, default: 0 },
    avgRougeL: { type: Number, required: true, default: 0 },
    avgBertScore: { type: Number, required: true, default: 0 },
    avgEntityF1: { type: Number, required: true, default: 0 },
    avgConsistencyScore: { type: Number, required: true, default: 0 },
    avgLatencyMs: { type: Number, required: true, default: 0 },
    avgClinicianCompleteness: { type: Number, default: null },
    avgClinicianCorrectness: { type: Number, default: null },
    avgClinicianConciseness: { type: Number, default: null },
    avgClinicianOverall: { type: Number, default: null },
    flaggedClaimRate: { type: Number, required: true, default: 0 },
}, { _id: false });
const BenchmarkRunSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    status: {
        type: String,
        enum: ['running', 'completed', 'failed'],
        default: 'running',
    },
    config: {
        documentIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Document' }],
        modelBackends: [{ type: String }],
        docType: { type: String },
    },
    resultsPerBackend: {
        type: [BackendBenchmarkResultSchema],
        default: [],
    },
    correlationStats: {
        type: mongoose_1.Schema.Types.Mixed,
        default: [],
    },
    reportMarkdown: { type: String },
    error: { type: String },
}, { timestamps: true });
exports.BenchmarkRunModel = (0, mongoose_1.model)('BenchmarkRun', BenchmarkRunSchema);
