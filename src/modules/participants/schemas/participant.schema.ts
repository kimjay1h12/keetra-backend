import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ParticipantDocument = HydratedDocument<Participant>;
export type ParticipantRole = 'host' | 'cohost' | 'participant';
export type ParticipantState = 'waiting' | 'joined' | 'removed' | 'left';

@Schema({ timestamps: true })
export class Participant {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Meeting' })
  meetingId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['host', 'cohost', 'participant'], default: 'participant' })
  role!: ParticipantRole;

  @Prop({ required: true, enum: ['waiting', 'joined', 'removed', 'left'], default: 'joined' })
  state!: ParticipantState;

  @Prop({ default: false })
  audioMuted!: boolean;

  @Prop({ default: false })
  videoMuted!: boolean;

  @Prop({ default: false })
  screenSharing!: boolean;
}

export const ParticipantSchema = SchemaFactory.createForClass(Participant);
ParticipantSchema.index({ meetingId: 1, userId: 1 }, { unique: true });
