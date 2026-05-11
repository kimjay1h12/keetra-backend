import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MeetingsController } from './meetings.controller';
import { MeetingsPublicController } from './meetings-public.controller';
import { MeetingsService } from './meetings.service';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { ParticipantsModule } from '../participants/participants.module';
import { SignalingModule } from '../signaling/signaling.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { ResolveMeetingMongoIdPipe } from './resolve-meeting-mongo-id.pipe';
import { AuthModule } from '../auth/auth.module';
import { GuestMeetingScopeGuard } from '../../common/guards/guest-meeting-scope.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Meeting.name, schema: MeetingSchema }]),
    forwardRef(() => ParticipantsModule),
    forwardRef(() => SignalingModule),
    TeamsModule,
    UsersModule,
    MailModule,
    AuthModule,
  ],
  controllers: [MeetingsController, MeetingsPublicController],
  providers: [MeetingsService, ResolveMeetingMongoIdPipe, GuestMeetingScopeGuard],
  exports: [MeetingsService, MongooseModule, ResolveMeetingMongoIdPipe, GuestMeetingScopeGuard],
})
export class MeetingsModule {}
