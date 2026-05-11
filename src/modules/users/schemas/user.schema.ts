import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export type AccountType = 'individual' | 'company';
export type CompanySizeBand = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: String, enum: ['individual', 'company'] })
  accountType?: AccountType;

  @Prop({ trim: true })
  displayName?: string;

  /** Optional E.164-ish dial string; used for client-side `tel:` handoff only. */
  @Prop({ trim: true })
  phone?: string;

  /** Optional image URL for avatars in meetings and profile. */
  @Prop({ trim: true })
  avatarUrl?: string;

  @Prop({ trim: true })
  title?: string;

  @Prop({ trim: true })
  bio?: string;

  @Prop({ trim: true })
  companyName?: string;

  @Prop({ type: String, enum: ['1-10', '11-50', '51-200', '201-1000', '1000+'] })
  companySize?: CompanySizeBand;

  @Prop({ default: false })
  profileCompleted!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
