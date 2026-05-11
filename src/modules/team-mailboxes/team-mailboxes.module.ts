import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamsModule } from '../teams/teams.module';
import { TeamMailDomain, TeamMailDomainSchema } from './schemas/team-mail-domain.schema';
import { TeamMailbox, TeamMailboxSchema } from './schemas/team-mailbox.schema';
import { TeamMailProvisionService } from './team-mail-provision.service';
import { TeamMailboxesService } from './team-mailboxes.service';
import { TeamMailboxesController } from './team-mailboxes.controller';

@Module({
  imports: [
    TeamsModule,
    MongooseModule.forFeature([
      { name: TeamMailDomain.name, schema: TeamMailDomainSchema },
      { name: TeamMailbox.name, schema: TeamMailboxSchema },
    ]),
  ],
  controllers: [TeamMailboxesController],
  providers: [TeamMailboxesService, TeamMailProvisionService],
  exports: [TeamMailboxesService],
})
export class TeamMailboxesModule {}
