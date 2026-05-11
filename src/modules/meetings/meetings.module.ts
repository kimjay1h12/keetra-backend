import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { ParticipantsModule } from '../participants/participants.module';
import { SignalingModule } from '../signaling/signaling.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { ResolveMeetingMongoIdPipe } from './resolve-meeting-mongo-id.pipe';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Meeting.name, schema: MeetingSchema }]),
    forwardRef(() => ParticipantsModule),
    forwardRef(() => SignalingModule),
    TeamsModule,
    UsersModule,
    MailModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, ResolveMeetingMongoIdPipe],
  exports: [MeetingsService, MongooseModule, ResolveMeetingMongoIdPipe],
})
export class MeetingsModule {}
