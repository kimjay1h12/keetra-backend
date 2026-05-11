import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TeamDocument = HydratedDocument<Team>;

@Schema({ timestamps: true })
export class Team {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId!: Types.ObjectId;

  /** Persistent join link until revoked by owner/admin (no expiry). */
  @Prop({ trim: true, sparse: true, unique: true })
  shareLinkToken?: string;
}

export const TeamSchema = SchemaFactory.createForClass(Team);
