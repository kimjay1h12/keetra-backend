import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MeetingDocument = HydratedDocument<Meeting>;
export type MeetingVisibility = 'public' | 'private';
export type MeetingStatus = 'scheduled' | 'live' | 'ended';

@Schema({ timestamps: true })
export class Meeting {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  hostId!: Types.ObjectId;

  @Prop({ required: true, enum: ['public', 'private'], default: 'public' })
  visibility!: MeetingVisibility;

  @Prop()
  passwordHash?: string;

  @Prop({ default: true })
  waitingRoomEnabled!: boolean;

  @Prop({ default: false })
  chatEnabled!: boolean;

  @Prop({ default: false })
  locked!: boolean;

  @Prop({ required: true, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' })
  status!: MeetingStatus;

  /** Public join code: 9 chars A-Z0-9 (stored uppercase). Unique when set; sparse allows many docs without a code. */
  @Prop({ trim: true, uppercase: true, unique: true, sparse: true })
  code?: string;

  /** When set and in the future at creation time, meeting stays `scheduled` until the host joins. */
  @Prop({ type: Date })
  scheduledAt?: Date;

  /** Repeat series after each session ends (`none` = one-off). */
  @Prop({ type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' })
  recurrence!: 'none' | 'daily' | 'weekly' | 'monthly';

  /** Inclusive end calendar (UTC end-of-day); omit for no end date. */
  @Prop({ type: Date })
  recurrenceUntil?: Date;

  /** If the live room has zero `joined` participants, set to now to start the idle auto-end window. Cleared when someone is `joined` again. */
  @Prop({ type: Date })
  emptySince?: Date;

  /** Optional team scope — used for listing for members and email invites. */
  @Prop({ type: Types.ObjectId, ref: 'Team' })
  teamId?: Types.ObjectId;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
MeetingSchema.index({ teamId: 1, scheduledAt: 1 });
MeetingSchema.index({ status: 1, emptySince: 1 });
