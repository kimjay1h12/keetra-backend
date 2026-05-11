import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParticipantsController } from './participants.controller';
import { ParticipantsService } from './participants.service';
import { Participant, ParticipantSchema } from './schemas/participant.schema';
import { Meeting, MeetingSchema } from '../meetings/schemas/meeting.schema';
import { SignalingModule } from '../signaling/signaling.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Participant.name, schema: ParticipantSchema },
      { name: Meeting.name, schema: MeetingSchema },
    ]),
    UsersModule,
    forwardRef(() => MeetingsModule),
    forwardRef(() => SignalingModule),
  ],
  controllers: [ParticipantsController],
  providers: [ParticipantsService],
  exports: [ParticipantsService, MongooseModule],
})
export class ParticipantsModule {}
