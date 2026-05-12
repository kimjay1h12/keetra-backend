import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { ChatModule } from './modules/chat/chat.module';
import { SignalingModule } from './modules/signaling/signaling.module';
import { SessionModule } from './modules/session/session.module';
import { ProfileModule } from './modules/profile/profile.module';
import { TeamsModule } from './modules/teams/teams.module';
import { TeamMailboxesModule } from './modules/team-mailboxes/team-mailboxes.module';
import { TaskBoardsModule } from './modules/task-boards/task-boards.module';
import { AppController } from './app.controller';
import { RtcModule } from './modules/rtc/rtc.module';
import { KeepaliveModule } from './modules/keepalive/keepalive.module';
import { AiModule } from './modules/ai/ai.module';
import { BulkEmailModule } from './modules/bulk-email/bulk-email.module';
import { BillingDocsModule } from './modules/billing-docs/billing-docs.module';
import { JobInterviewsModule } from './modules/job-interviews/job-interviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),
    SessionModule,
    UsersModule,
    ProfileModule,
    TeamsModule,
    JobInterviewsModule,
    TeamMailboxesModule,
    TaskBoardsModule,
    AuthModule,
    SignalingModule,
    MeetingsModule,
    ParticipantsModule,
    ChatModule,
    RtcModule,
    KeepaliveModule,
    AiModule,
    BulkEmailModule,
    BillingDocsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
