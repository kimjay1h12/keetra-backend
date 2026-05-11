import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

export type TaskBoardDocument = HydratedDocument<TaskBoard>;

@Schema({ timestamps: true })
export class TaskBoard {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId!: Types.ObjectId;

  /** When set, all team members can use the board. */
  @Prop({ type: Types.ObjectId, ref: 'Team' })
  teamId?: Types.ObjectId;

  @Prop({ trim: true, default: '#0079bf' })
  background!: string;

  @Prop({ default: false })
  archived!: boolean;
}

export const TaskBoardSchema = SchemaFactory.createForClass(TaskBoard);
TaskBoardSchema.index({ ownerId: 1, updatedAt: -1 });
TaskBoardSchema.index({ teamId: 1, updatedAt: -1 });
