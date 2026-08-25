import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export interface IFlaggedClaim {
  claimText: string;
  startOffset: number;
  endOffset: number;
  sentence?: string;
  sourceChunkId?: string;
  sourceDocumentId?: string;
  sourceFilename?: string;
  verdict?: string;
  confidence?: number;
  reason?: string;
}

export interface ISummary extends MongooseDoc {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  summaryText: string;
  tokenCount: number;
  automaticMetrics: Record<string, unknown>;
  consistencyScore?: number | null;
  flaggedClaims: IFlaggedClaim[];
  createdAt: Date;
  updatedAt: Date;
}

const FlaggedClaimSchema = new Schema<IFlaggedClaim>(
  {
    claimText: { type: String, required: true },
    startOffset: { type: Number, required: true },
    endOffset: { type: Number, required: true },
    sentence: { type: String },
    sourceChunkId: { type: String },
    sourceDocumentId: { type: String },
    sourceFilename: { type: String },
    verdict: { type: String },
    confidence: { type: Number },
    reason: { type: String },
  },
  { _id: false },
);

const SummarySchema = new Schema<ISummary>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
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
      type: Schema.Types.Mixed,
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
  },
  { timestamps: true },
);

export const SummaryModel = model<ISummary>('Summary', SummarySchema);
