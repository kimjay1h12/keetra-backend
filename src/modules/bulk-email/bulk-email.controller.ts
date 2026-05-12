import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RejectMeetingGuestGuard } from '../../common/guards/reject-meeting-guest.guard';
import { BulkEmailService } from './bulk-email.service';
import {
  CreateBulkEmailScheduleDto,
  CreateBulkEmailTemplateDto,
  SendBulkEmailDto,
  UpdateBulkEmailTemplateDto,
} from './dto/bulk-email.dto';

@ApiTags('bulk-email')
@ApiBearerAuth('JWT-auth')
@Controller('bulk-email')
@UseGuards(JwtAuthGuard, RejectMeetingGuestGuard)
export class BulkEmailController {
  constructor(private readonly bulkEmail: BulkEmailService) {}

  @Get('presets')
  listPresets() {
    const data = this.bulkEmail.listPresets();
    return { status: 'success' as const, data };
  }

  @Get('presets/:key')
  getPreset(@Param('key') key: string) {
    const data = this.bulkEmail.getPreset(key);
    return { status: 'success' as const, data };
  }

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.bulkEmail.listTemplates(user.id).then((data) => ({ status: 'success' as const, data }));
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateBulkEmailTemplateDto) {
    return this.bulkEmail.createTemplate(user.id, dto).then((data) => ({ status: 'success' as const, data }));
  }

  @Get('templates/:id')
  getTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bulkEmail.getTemplate(user.id, id).then((data) => ({ status: 'success' as const, data }));
  }

  @Patch('templates/:id')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBulkEmailTemplateDto,
  ) {
    return this.bulkEmail.updateTemplate(user.id, id, dto).then((data) => ({ status: 'success' as const, data }));
  }

  @Delete('templates/:id')
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bulkEmail.deleteTemplate(user.id, id).then((data) => ({ status: 'success' as const, data }));
  }

  @Post('send')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendBulkEmailDto) {
    return this.bulkEmail.send(user.id, dto).then((data) => ({ status: 'success' as const, data }));
  }

  @Get('history')
  listHistory(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 40;
    return this.bulkEmail
      .listHistory(user.id, Number.isFinite(n) ? n : 40)
      .then((data) => ({ status: 'success' as const, data }));
  }

  @Get('history/:id')
  getSend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bulkEmail.getSend(user.id, id).then((data) => ({ status: 'success' as const, data }));
  }

  @Post('history/:id/resend')
  resend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bulkEmail.resend(user.id, id).then((data) => ({ status: 'success' as const, data }));
  }

  @Get('schedules')
  listSchedules(@CurrentUser() user: AuthUser) {
    return this.bulkEmail.listSchedules(user.id).then((data) => ({ status: 'success' as const, data }));
  }

  @Post('schedules')
  createSchedule(@CurrentUser() user: AuthUser, @Body() dto: CreateBulkEmailScheduleDto) {
    return this.bulkEmail.createSchedule(user.id, dto).then((data) => ({ status: 'success' as const, data }));
  }

  @Delete('schedules/:id')
  cancelSchedule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bulkEmail.cancelSchedule(user.id, id).then((data) => ({ status: 'success' as const, data }));
  }
}
