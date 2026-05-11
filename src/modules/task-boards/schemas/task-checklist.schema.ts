import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types, HydratedDocument } from 'mongoose';

export type TaskChecklistDocument = HydratedDocument<TaskChecklist>;

const ChecklistItemSchema = new MongooseSchema(
  {
    title: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: true },
);

@Schema({ timestamps: true })
export class TaskChecklist {
  @Prop({ type: Types.ObjectId, ref: 'TaskBoard', required: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TaskCard', required: true })
  cardId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: [ChecklistItemSchema], default: [] })
  items!: Array<{ _id: Types.ObjectId; title: string; done: boolean; order: number }>;
}

export const TaskChecklistSchema = SchemaFactory.createForClass(TaskChecklist);
TaskChecklistSchema.index({ cardId: 1 });
