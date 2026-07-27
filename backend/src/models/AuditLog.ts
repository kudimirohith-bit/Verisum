import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export type AuditEventType = 'upload' | 'summarize' | 'verify' | 'review' | 'export';

export interface IAuditLog extends MongooseDoc {
  _id: Types.ObjectId;
  eventType: AuditEventType;
  actorId?: Types.ObjectId | null;
  documentId?: Types.ObjectId | null;
  jobId?: Types.ObjectId | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    eventType: {
      type: String,
      enum: ['upload', 'summarize', 'verify', 'review', 'export'] as AuditEventType[],
      required: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      default: null,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'SummarizationJob',
      default: null,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

// Compound index on eventType + createdAt for audit trail queries
AuditLogSchema.index({ eventType: 1, createdAt: -1 });

export const AuditLogModel = model<IAuditLog>('AuditLog', AuditLogSchema);
