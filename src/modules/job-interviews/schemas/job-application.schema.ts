import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type JobApplicationDocument = HydratedDocument<JobApplication>;

export type JobApplicationStatus =
  | 'invited'
  | 'in_progress'
  | 'submitted'
  | 'expired'
  | 'terminated'
  | 'withdrawn';

export type InterviewTurn = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  at: Date;
};

@Schema({ timestamps: true })
export class JobApplication {
  @Prop({ type: Types.ObjectId, ref: 'JobPosting', required: true, index: true })
  jobId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  candidateName!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  candidateEmail!: string;

  @Prop({ required: true, trim: true })
  linkedinProfileUrl!: string;

  @Prop({ required: true })
  cvStoredFilename!: string;

  @Prop({ required: true })
  cvOriginalFilename!: string;

  @Prop({ required: true })
  cvMimeType!: string;

  @Prop({ required: true })
  cvSizeBytes!: number;

  @Prop({ required: true })
  interviewTokenHash!: string;

  @Prop({ type: Date, required: true })
  tokenExpiresAt!: Date;

  @Prop({
    type: String,
    enum: ['invited', 'in_progress', 'submitted', 'expired', 'terminated', 'withdrawn'],
    default: 'invited',
  })
  status!: JobApplicationStatus;

  /** Set when status becomes terminated (proctoring policy). */
  @Prop({ trim: true })
  terminationReason?: string;

  /** Wall-clock anchor for whole-session interview timer (set when interview starts). */
  @Prop({ type: Date })
  interviewClockStartAt?: Date;

  @Prop({
    type: [
      {
        role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
        content: { type: String, required: true },
        at: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  })
  messages!: InterviewTurn[];

  @Prop({ trim: true })
  aiSummary?: string;

  @Prop({ type: Object })
  scores?: Record<string, unknown>;

  @Prop({ type: Number })
  rankScore?: number;

  @Prop({ type: Object })
  proctoringSummary?: Record<string, unknown>;
}

export const JobApplicationSchema = SchemaFactory.createForClass(JobApplication);
JobApplicationSchema.index({ jobId: 1, createdAt: -1 });
JobApplicationSchema.index({ interviewTokenHash: 1 }, { unique: true });
