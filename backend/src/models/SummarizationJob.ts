import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export type JobStatus = 'queued' | 'running' | 'verifying' | 'completed' | 'failed';

export interface ISummarizationJob extends MongooseDoc {
  _id: Types.ObjectId;
  documentIds: Types.ObjectId[];
  modelBackend: string;
  status: JobStatus;
  createdAt: Date;
  completedAt?: Date | null;
  updatedAt: Date;
}

const SummarizationJobSchema = new Schema<ISummarizationJob>(
  {
    documentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
      },
    ],
    modelBackend: {
      type: String,
      required: true,
      default: 'local',
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'verifying', 'completed', 'failed'] as JobStatus[],
      required: true,
      default: 'queued',
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Index on status for job queue polling
SummarizationJobSchema.index({ status: 1 });

export const SummarizationJobModel = model<ISummarizationJob>(
  'SummarizationJob',
  SummarizationJobSchema,
);
