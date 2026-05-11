import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TeamMailboxDocument = HydratedDocument<TeamMailbox>;

export type TeamMailboxStatus = 'active' | 'disabled';

/** v1: full IMAP mailbox. `forward` reserved for outbound/alias-only flows. */
export type TeamMailboxKind = 'mailbox' | 'forward';

@Schema({ timestamps: true })
export class TeamMailbox {
  @Prop({ type: Types.ObjectId, ref: 'Team', required: true })
  teamId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TeamMailDomain', required: true })
  domainId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  localPart!: string;

  @Prop({ type: String, enum: ['mailbox', 'forward'], default: 'mailbox' })
  kind!: TeamMailboxKind;

  @Prop({ trim: true })
  displayName?: string;

  /** Target inbox for forward kind (optional v1). */
  @Prop({ trim: true })
  forwardTo?: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ type: Number, default: 512 })
  quotaMb!: number;

  @Prop({ type: String, enum: ['active', 'disabled'], default: 'active' })
  status!: TeamMailboxStatus;
}

export const TeamMailboxSchema = SchemaFactory.createForClass(TeamMailbox);
TeamMailboxSchema.index({ teamId: 1, domainId: 1, localPart: 1 }, { unique: true });
TeamMailboxSchema.index({ status: 1 });
