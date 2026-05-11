import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TeamMailDomainDocument = HydratedDocument<TeamMailDomain>;

export type TeamMailDomainVerificationStatus = 'pending' | 'verified';

@Schema({ timestamps: true })
export class TeamMailDomain {
  @Prop({ type: Types.ObjectId, ref: 'Team', required: true })
  teamId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  domain!: string;

  @Prop({
    type: String,
    enum: ['pending', 'verified'],
    default: 'pending',
  })
  verificationStatus!: TeamMailDomainVerificationStatus;

  /** TXT token value (without prefix). Only for custom domains until verified. */
  @Prop({ trim: true })
  verificationToken?: string;

  @Prop({ default: false })
  isDefault!: boolean;
}

export const TeamMailDomainSchema = SchemaFactory.createForClass(TeamMailDomain);
TeamMailDomainSchema.index({ teamId: 1, domain: 1 }, { unique: true });
