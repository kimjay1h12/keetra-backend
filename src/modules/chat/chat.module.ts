import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { Participant, ParticipantSchema } from '../participants/schemas/participant.schema';
import { SignalingModule } from '../signaling/signaling.module';
import { MeetingsModule } from '../meetings/meetings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: Participant.name, schema: ParticipantSchema },
    ]),
    forwardRef(() => MeetingsModule),
    forwardRef(() => SignalingModule),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
