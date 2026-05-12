import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type BulkEmailScheduleDocument = HydratedDocument<BulkEmailSchedule>;

@Schema({ timestamps: true })
export class BulkEmailSchedule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  subject!: string;

  @Prop({ required: true })
  htmlBody!: string;

  @Prop({ trim: true })
  textBody?: string;

  @Prop({ type: [String], required: true })
  recipients!: string[];

  @Prop({ required: true, enum: ['weekly', 'monthly'] })
  frequency!: 'weekly' | 'monthly';

  @Prop({ type: Date, required: true, index: true })
  nextRunAt!: Date;

  @Prop({ type: Date })
  lastRunAt?: Date;

  @Prop({ default: true })
  active!: boolean;
}

export const BulkEmailScheduleSchema = SchemaFactory.createForClass(BulkEmailSchedule);
BulkEmailScheduleSchema.index({ active: 1, nextRunAt: 1 });
