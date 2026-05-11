import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TaskCardDocument = HydratedDocument<TaskCard>;

@Schema({ timestamps: true })
export class TaskCard {
  @Prop({ type: Types.ObjectId, ref: 'TaskBoard', required: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TaskList', required: true })
  listId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({ type: Number, default: 0 })
  position!: number;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ trim: true })
  coverColor?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'TaskLabel' }], default: [] })
  labelIds!: Types.ObjectId[];

  /** Team members assigned to this card (team boards only). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  assigneeIds!: Types.ObjectId[];
}

export const TaskCardSchema = SchemaFactory.createForClass(TaskCard);
TaskCardSchema.index({ boardId: 1, listId: 1, position: 1 });
