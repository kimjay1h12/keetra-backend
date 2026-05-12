import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type JobPostingDocument = HydratedDocument<JobPosting>;

export type JobPostingStatus = 'draft' | 'open' | 'closed';

@Schema({ timestamps: true })
export class JobPosting {
  @Prop({ type: Types.ObjectId, ref: 'Team', required: true, index: true })
  teamId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  /** URL-safe unique slug for public apply page */
  @Prop({ required: true, trim: true, lowercase: true })
  publicSlug!: string;

  @Prop({ required: true, trim: true })
  requirementsText!: string;

  /** Normalized skill labels (trimmed, deduped case-insensitively). */
  @Prop({ type: [String], default: [] })
  skills!: string[];

  @Prop({ type: String, enum: ['draft', 'open', 'closed'], default: 'draft' })
  status!: JobPostingStatus;

  @Prop({
    type: {
      maxQuestions: { type: Number, default: 8 },
      tokenTtlHours: { type: Number, default: 72 },
      timerMode: {
        type: String,
        enum: ['off', 'per_question', 'session'],
        default: 'off',
      },
      timerSecondsPerQuestion: { type: Number, default: 180 },
      timerSecondsTotal: { type: Number, default: 1800 },
    },
    _id: false,
    default: () => ({
      maxQuestions: 8,
      tokenTtlHours: 72,
      timerMode: 'off',
      timerSecondsPerQuestion: 180,
      timerSecondsTotal: 1800,
    }),
  })
  interviewConfig!: {
    maxQuestions: number;
    tokenTtlHours: number;
    timerMode: 'off' | 'per_question' | 'session';
    timerSecondsPerQuestion: number;
    timerSecondsTotal: number;
  };
}

export const JobPostingSchema = SchemaFactory.createForClass(JobPosting);
JobPostingSchema.index({ publicSlug: 1 }, { unique: true });
JobPostingSchema.index({ teamId: 1, createdAt: -1 });
