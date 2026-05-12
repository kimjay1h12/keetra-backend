import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type BulkEmailSendDocument = HydratedDocument<BulkEmailSend>;

@Schema({ timestamps: true })
export class BulkEmailSend {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  subject!: string;

  @Prop({ required: true })
  htmlBody!: string;

  @Prop({ trim: true })
  textBody?: string;

  @Prop({ type: [String], required: true })
  to!: string[];

  @Prop({ type: Types.ObjectId, ref: 'Team' })
  teamId?: Types.ObjectId;

  /** Preset slug from built-in library, if used */
  @Prop({ trim: true, maxlength: 64 })
  presetKey?: string;

  @Prop({ type: Types.ObjectId, ref: 'BulkEmailTemplate' })
  customTemplateId?: Types.ObjectId;

  @Prop({ required: true, enum: ['completed', 'skipped', 'partial'] })
  status!: 'completed' | 'skipped' | 'partial';

  @Prop({ type: Number, default: 0 })
  recipientCount!: number;
}

export const BulkEmailSendSchema = SchemaFactory.createForClass(BulkEmailSend);
BulkEmailSendSchema.index({ ownerUserId: 1, createdAt: -1 });
