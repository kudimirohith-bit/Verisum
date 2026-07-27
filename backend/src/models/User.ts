import { Schema, model, Document as MongooseDoc, Types } from 'mongoose';

export type UserRole = 'clinician' | 'researcher' | 'admin';

export interface IUser extends MongooseDoc {
  _id: Types.ObjectId;
  email: string;
  role: UserRole;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['clinician', 'researcher', 'admin'] as UserRole[],
      required: true,
      default: 'clinician',
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);


export const UserModel = model<IUser>('User', UserSchema);
