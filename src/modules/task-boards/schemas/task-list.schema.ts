import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TaskListDocument = HydratedDocument<TaskList>;

@Schema({ timestamps: true })
export class TaskList {
  @Prop({ type: Types.ObjectId, ref: 'TaskBoard', required: true })
  boardId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: Number, default: 0 })
  position!: number;
}

export const TaskListSchema = SchemaFactory.createForClass(TaskList);
TaskListSchema.index({ boardId: 1, position: 1 });
