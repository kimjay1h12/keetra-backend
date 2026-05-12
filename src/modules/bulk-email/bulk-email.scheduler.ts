import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BulkEmailService } from './bulk-email.service';

@Injectable()
export class BulkEmailScheduler {
  private readonly logger = new Logger(BulkEmailScheduler.name);

  constructor(private readonly bulkEmail: BulkEmailService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async processDueSchedules() {
    const n = await this.bulkEmail.processDueSchedules();
    if (n > 0) this.logger.log(`Processed ${n} bulk email schedule(s)`);
  }
}
