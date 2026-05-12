import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RejectMeetingGuestGuard } from '../../common/guards/reject-meeting-guest.guard';
import { BillingDocsService } from './billing-docs.service';
import {
  BillingDocPreviewDto,
  CreateBillingDocTemplateDto,
  SendBillingDocDto,
  UpdateBillingDocTemplateDto,
} from './dto/billing-docs.dto';

@ApiTags('billing-docs')
@ApiBearerAuth('JWT-auth')
@Controller('billing-docs')
@UseGuards(JwtAuthGuard, RejectMeetingGuestGuard)
export class BillingDocsController {
  constructor(private readonly billingDocs: BillingDocsService) {}

  @Get('styles')
  listStyles() {
    const data = this.billingDocs.listStyles();
    return { status: 'success' as const, data };
  }

  @Post('preview')
  preview(@Body() dto: BillingDocPreviewDto) {
    const data = this.billingDocs.preview(dto);
    return { status: 'success' as const, data };
  }

  @Post('send')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendBillingDocDto) {
    return this.billingDocs.send(user.id, dto).then((data) => ({ status: 'success' as const, data }));
  }

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.billingDocs.listTemplates(user.id).then((data) => ({ status: 'success' as const, data }));
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateBillingDocTemplateDto) {
    return this.billingDocs.createTemplate(user.id, dto).then((data) => ({ status: 'success' as const, data }));
  }

  @Get('templates/:id')
  getTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billingDocs.getTemplate(user.id, id).then((data) => ({ status: 'success' as const, data }));
  }

  @Patch('templates/:id')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBillingDocTemplateDto,
  ) {
    return this.billingDocs.updateTemplate(user.id, id, dto).then((data) => ({ status: 'success' as const, data }));
  }

  @Delete('templates/:id')
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billingDocs.deleteTemplate(user.id, id).then((data) => ({ status: 'success' as const, data }));
  }
}
