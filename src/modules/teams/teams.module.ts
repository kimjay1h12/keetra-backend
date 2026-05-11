import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { SignalingModule } from '../signaling/signaling.module';
import { Team, TeamSchema } from './schemas/team.schema';
import { TeamInvite, TeamInviteSchema } from './schemas/team-invite.schema';
import { TeamMember, TeamMemberSchema } from './schemas/team-member.schema';
import { TeamChatMessage, TeamChatMessageSchema } from './schemas/team-chat-message.schema';
import {
  TeamChatAttachment,
  TeamChatAttachmentSchema,
} from './schemas/team-chat-attachment.schema';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TeamChatService } from './team-chat.service';

@Module({
  imports: [
    UsersModule,
    MailModule,
    MongooseModule.forFeature([
      { name: Team.name, schema: TeamSchema },
      { name: TeamMember.name, schema: TeamMemberSchema },
      { name: TeamInvite.name, schema: TeamInviteSchema },
      { name: TeamChatMessage.name, schema: TeamChatMessageSchema },
      { name: TeamChatAttachment.name, schema: TeamChatAttachmentSchema },
    ]),
    forwardRef(() => SignalingModule),
  ],
  controllers: [TeamsController],
  providers: [TeamsService, TeamChatService],
  exports: [TeamsService],
})
export class TeamsModule {}
