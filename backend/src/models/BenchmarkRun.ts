import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export interface IBackendBenchmarkResult {
  modelBackend: string;
  count: number;
  avgRouge1: number;
  avgRouge2: number;
  avgRougeL: number;
  avgBertScore: number;
  avgEntityF1: number;
  avgConsistencyScore: number;
  avgLatencyMs: number;
  avgClinicianCompleteness?: number | null;
  avgClinicianCorrectness?: number | null;
  avgClinicianConciseness?: number | null;
  avgClinicianOverall?: number | null;
  flaggedClaimRate: number;
}

export interface IBenchmarkRun extends MongooseDoc {
  _id: Types.ObjectId;
  name: string;
  status: 'running' | 'completed' | 'failed';
  config: {
    documentIds: Types.ObjectId[];
    modelBackends: string[];
    docType?: string;
  };
  resultsPerBackend: IBackendBenchmarkResult[];
  correlationStats: any[];
  reportMarkdown?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BackendBenchmarkResultSchema = new Schema<IBackendBenchmarkResult>(
  {
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
  },
  { _id: false },
);

const BenchmarkRunSchema = new Schema<IBenchmarkRun>(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
    },
    config: {
      documentIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
      modelBackends: [{ type: String }],
      docType: { type: String },
    },
    resultsPerBackend: {
      type: [BackendBenchmarkResultSchema],
      default: [],
    },
    correlationStats: {
      type: Schema.Types.Mixed,
      default: [],
    },
    reportMarkdown: { type: String },
    error: { type: String },
  },
  { timestamps: true },
);

export const BenchmarkRunModel = model<IBenchmarkRun>('BenchmarkRun', BenchmarkRunSchema);
