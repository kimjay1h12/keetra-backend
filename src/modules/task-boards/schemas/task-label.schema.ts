import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TaskLabelDocument = HydratedDocument<TaskLabel>;

@Schema({ timestamps: true })
export class TaskLabel {
  @Prop({ type: Types.ObjectId, ref: 'TaskBoard', required: true })
  boardId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '#61bd4f' })
  color!: string;
}

export const TaskLabelSchema = SchemaFactory.createForClass(TaskLabel);
TaskLabelSchema.index({ boardId: 1 });
