import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export interface IStudy extends MongooseDoc {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  enrolledBackends: string[];
  enrolledDocTypes: string[];
  primaryOutcomeMetric: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudySchema = new Schema<IStudy>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    enrolledBackends: [
      {
        type: String,
        required: true,
      },
    ],
    enrolledDocTypes: [
      {
        type: String,
        required: true,
      },
    ],
    primaryOutcomeMetric: {
      type: String,
      required: true,
      trim: true,
      default: 'clinician_time_saved',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

export const StudyModel = model<IStudy>('Study', StudySchema);
