import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TeamChatMessageDocument = HydratedDocument<TeamChatMessage>;

@Schema({ timestamps: true })
export class TeamChatMessage {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Team' })
  teamId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  senderId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  content!: string;

  @Prop({ type: [{ type: Types.ObjectId }], default: [] })
  mentionUserIds!: Types.ObjectId[];

  @Prop({
    type: [
      {
        attachmentId: { type: Types.ObjectId, required: true },
        kind: { type: String, enum: ['image', 'file'], required: true },
        name: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
      },
    ],
    default: [],
  })
  attachments!: Array<{
    attachmentId: Types.ObjectId;
    kind: 'image' | 'file';
    name: string;
    mimeType: string;
    size: number;
  }>;
}

export const TeamChatMessageSchema = SchemaFactory.createForClass(TeamChatMessage);
TeamChatMessageSchema.index({ teamId: 1, createdAt: -1 });
