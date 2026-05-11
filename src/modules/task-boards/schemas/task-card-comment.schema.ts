import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TaskCardCommentDocument = HydratedDocument<TaskCardComment>;

@Schema({ timestamps: true })
export class TaskCardComment {
  @Prop({ type: Types.ObjectId, ref: 'TaskBoard', required: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TaskCard', required: true })
  cardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  body!: string;
}

export const TaskCardCommentSchema = SchemaFactory.createForClass(TaskCardComment);
TaskCardCommentSchema.index({ cardId: 1, createdAt: 1 });
