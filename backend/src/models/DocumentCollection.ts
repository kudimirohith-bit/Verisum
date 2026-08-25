import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';
import { DocType } from './Document.js';

export interface IDocumentCollection extends MongooseDoc {
  _id: Types.ObjectId;
  name: string;
  ownerId: Types.ObjectId;
  docType: DocType;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentCollectionSchema = new Schema<IDocumentCollection>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
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
      default: 'biomedical_literature',
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true },
);

DocumentCollectionSchema.index({ ownerId: 1, name: 1 });

export const DocumentCollectionModel = model<IDocumentCollection>(
  'DocumentCollection',
  DocumentCollectionSchema,
);
