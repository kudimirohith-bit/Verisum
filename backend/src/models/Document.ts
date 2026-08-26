import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export type DocType =
  | 'ehr_note'
  | 'discharge_summary'
  | 'radiology_report'
  | 'dialogue_transcript'
  | 'biomedical_literature';

export type PhiStatus = 'raw' | 'deidentified' | 'n/a';

export interface IDocument extends MongooseDoc {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  docType: DocType;
  rawText: string;
  sourceFilename: string;
  language: string;
  uploadedAt: Date;
  phiStatus: PhiStatus;
  collectionId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
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
      ] as DocType[],
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
      enum: ['raw', 'deidentified', 'n/a'] as PhiStatus[],
      required: true,
      default: 'raw',
    },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'DocumentCollection',
      default: null,
    },
  },
  { timestamps: true },
);

// Index for fast lookup by owner
DocumentSchema.index({ ownerId: 1 });

export const DocumentModel = model<IDocument>('Document', DocumentSchema);
