import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type BillingDocTemplateDocument = HydratedDocument<BillingDocTemplate>;

@Schema({ timestamps: true })
export class BillingDocTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ required: true, enum: ['invoice', 'receipt'] })
  kind!: 'invoice' | 'receipt';

  @Prop({ required: true, trim: true, maxlength: 32 })
  styleKey!: string;

  /** JSON string: partial BillingDocPayload for form defaults */
  @Prop({ type: String, default: '{}' })
  defaultsJson!: string;
}

export const BillingDocTemplateSchema = SchemaFactory.createForClass(BillingDocTemplate);
BillingDocTemplateSchema.index({ ownerUserId: 1, name: 1 });
