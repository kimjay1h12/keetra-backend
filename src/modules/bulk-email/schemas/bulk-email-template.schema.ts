import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type BulkEmailTemplateDocument = HydratedDocument<BulkEmailTemplate>;

@Schema({ timestamps: true })
export class BulkEmailTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  subject!: string;

  @Prop({ required: true })
  htmlBody!: string;

  @Prop({ trim: true })
  textBody?: string;
}

export const BulkEmailTemplateSchema = SchemaFactory.createForClass(BulkEmailTemplate);
BulkEmailTemplateSchema.index({ ownerUserId: 1, name: 1 });
