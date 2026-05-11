import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChatMessageDocument = HydratedDocument<ChatMessage>;

@Schema({ timestamps: true })
export class ChatMessage {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Meeting' })
  meetingId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  senderId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  content!: string;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
