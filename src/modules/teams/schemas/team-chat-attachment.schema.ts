import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TeamChatAttachmentDocument = HydratedDocument<TeamChatAttachment>;

@Schema({ timestamps: true })
export class TeamChatAttachment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Team' })
  teamId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  uploadedBy!: Types.ObjectId;

  /** Filename within uploads/team-chat/{teamId}/ */
  @Prop({ required: true, trim: true })
  storedFilename!: string;

  @Prop({ required: true, trim: true })
  originalName!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  size!: number;
}

export const TeamChatAttachmentSchema = SchemaFactory.createForClass(TeamChatAttachment);
