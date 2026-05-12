import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProctoringEventDocument = HydratedDocument<ProctoringEvent>;

export type ProctoringEventType =
  | 'no_face'
  | 'multiple_faces'
  | 'gaze_away'
  | 'tab_hidden'
  | 'camera_denied';

@Schema({ timestamps: true })
export class ProctoringEvent {
  @Prop({ type: Types.ObjectId, ref: 'JobApplication', required: true, index: true })
  applicationId!: Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() })
  ts!: Date;

  @Prop({
    type: String,
    enum: ['no_face', 'multiple_faces', 'gaze_away', 'tab_hidden', 'camera_denied'],
    required: true,
  })
  type!: ProctoringEventType;

  @Prop({ type: Number, default: 1 })
  severity!: number;

  @Prop({ type: Object })
  meta?: Record<string, unknown>;
}

export const ProctoringEventSchema = SchemaFactory.createForClass(ProctoringEvent);
ProctoringEventSchema.index({ applicationId: 1, createdAt: -1 });
