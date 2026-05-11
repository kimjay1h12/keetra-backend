import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from './schemas/chat-message.schema';
import { Participant, ParticipantDocument } from '../participants/schemas/participant.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatMessage.name) private readonly messageModel: Model<ChatMessageDocument>,
    @InjectModel(Participant.name) private readonly participantModel: Model<ParticipantDocument>,
  ) {}

  async list(meetingId: string) {
    return this.messageModel
      .find({ meetingId: new Types.ObjectId(meetingId) })
      .sort({ createdAt: 1 })
      .limit(200);
  }

  async create(meetingId: string, senderId: string, content: string) {
    const participant = await this.participantModel.findOne({
      meetingId: new Types.ObjectId(meetingId),
      userId: new Types.ObjectId(senderId),
      state: 'joined',
    });
    if (!participant) {
      throw new ForbiddenException('Only joined participants can send chat');
    }

    return this.messageModel.create({
      meetingId: new Types.ObjectId(meetingId),
      senderId: new Types.ObjectId(senderId),
      content: content.trim(),
    });
  }
}
