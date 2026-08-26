import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export interface IClinicianFeedback extends MongooseDoc {
  _id: Types.ObjectId;
  summaryId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  completenessRating: number;
  correctnessRating: number;
  concisenessRating: number;
  comment?: string;
  timeOnTaskMs?: number;
  studyId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ClinicianFeedbackSchema = new Schema<IClinicianFeedback>(
  {
    summaryId: {
      type: Schema.Types.ObjectId,
      ref: 'Summary',
      required: true,
    },
    reviewerId: {
      type: Schema.Types.ObjectId,
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
    timeOnTaskMs: {
      type: Number,
      min: 0,
    },
    studyId: {
      type: Schema.Types.ObjectId,
      ref: 'Study',
    },
  },
  { timestamps: true },
);

export const ClinicianFeedbackModel = model<IClinicianFeedback>(
  'ClinicianFeedback',
  ClinicianFeedbackSchema,
);
