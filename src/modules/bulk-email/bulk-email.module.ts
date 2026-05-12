import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import { TeamsModule } from '../teams/teams.module';
import { BulkEmailController } from './bulk-email.controller';
import { BulkEmailScheduler } from './bulk-email.scheduler';
import { BulkEmailService } from './bulk-email.service';
import { BulkEmailSchedule, BulkEmailScheduleSchema } from './schemas/bulk-email-schedule.schema';
import { BulkEmailSend, BulkEmailSendSchema } from './schemas/bulk-email-send.schema';
import { BulkEmailTemplate, BulkEmailTemplateSchema } from './schemas/bulk-email-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BulkEmailTemplate.name, schema: BulkEmailTemplateSchema },
      { name: BulkEmailSend.name, schema: BulkEmailSendSchema },
      { name: BulkEmailSchedule.name, schema: BulkEmailScheduleSchema },
    ]),
    MailModule,
    TeamsModule,
  ],
  controllers: [BulkEmailController],
  providers: [BulkEmailService, BulkEmailScheduler],
  exports: [BulkEmailService],
})
export class BulkEmailModule {}
