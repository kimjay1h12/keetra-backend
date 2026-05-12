import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import { BillingDocsController } from './billing-docs.controller';
import { BillingDocsService } from './billing-docs.service';
import { BillingDocTemplate, BillingDocTemplateSchema } from './schemas/billing-doc-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BillingDocTemplate.name, schema: BillingDocTemplateSchema }]),
    MailModule,
  ],
  controllers: [BillingDocsController],
  providers: [BillingDocsService],
  exports: [BillingDocsService],
})
export class BillingDocsModule {}
