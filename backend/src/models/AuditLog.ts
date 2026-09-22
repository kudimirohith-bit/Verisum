import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export type AuditEventType = 'auth' | 'upload' | 'summarize' | 'verify' | 'review' | 'export' | 'study_created';

export interface IAuditLog extends MongooseDoc {
  _id: Types.ObjectId;
  eventType: AuditEventType;
  actorId?: Types.ObjectId | null;
  documentId?: Types.ObjectId | null;
  jobId?: Types.ObjectId | null;
  summaryId?: Types.ObjectId | null;
  requestId?: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    eventType: {
      type: String,
      enum: ['auth', 'upload', 'summarize', 'verify', 'review', 'export', 'study_created'] as AuditEventType[],
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
    summaryId: {
      type: Schema.Types.ObjectId,
      ref: 'Summary',
      default: null,
    },
    requestId: {
      type: String,
      default: null,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

// Compound indexes for fast administrative filtering & auditing
AuditLogSchema.index({ eventType: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ documentId: 1 });
AuditLogSchema.index({ jobId: 1 });

// ── Immutability Enforcement ───────────────────────────────────────────────────
// Audit logs are append-only. Prevent update and delete mutations via Mongoose hooks.
const immutableError = () => new Error('Audit logs are immutable and cannot be updated or deleted.');

AuditLogSchema.pre('updateOne', function (next) {
  next(immutableError());
});

AuditLogSchema.pre('findOneAndUpdate', function (next) {
  next(immutableError());
});

AuditLogSchema.pre('deleteOne', function (next) {
  next(immutableError());
});

AuditLogSchema.pre('deleteMany', function (next) {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  next(immutableError());
});

export const AuditLogModel = model<IAuditLog>('AuditLog', AuditLogSchema);
