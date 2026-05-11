import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { JoinMeetingDto } from './dto/join-meeting.dto';
import { UpdateMeetingSettingsDto } from './dto/update-meeting-settings.dto';
import { SignalingGateway } from '../signaling/signaling.gateway';
import { ResolveMeetingMongoIdPipe } from './resolve-meeting-mongo-id.pipe';

@ApiTags('meetings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly signalingGateway: SignalingGateway,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateMeetingDto) {
    const data = await this.meetingsService.create(user.id, dto);
    return { status: 'success', data };
  }

  @Get(':meetingId')
  async get(@Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string) {
    const data = await this.meetingsService.findById(meetingId);
    return { status: 'success', data };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const data = await this.meetingsService.listForUser(user.id);
    return { status: 'success', data };
  }

  @Post(':meetingId/join')
  async join(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: JoinMeetingDto,
  ) {
    const data = await this.meetingsService.join(meetingId, user.id, dto.password);
    this.signalingGateway.emitToMeeting(meetingId, 'meeting.participant.joined', {
      type: 'meeting.participant.joined',
      meetingId,
      participant: data,
    });
    if (data.state === 'waiting') {
      this.signalingGateway.emitToMeeting(meetingId, 'meeting.waiting.new', {
        type: 'meeting.waiting.new',
        meetingId,
        participant: data,
      });
    }
    return { status: 'success', data };
  }

  @Post(':meetingId/leave')
  async leave(@Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string, @CurrentUser() user: AuthUser) {
    const data = await this.meetingsService.leave(meetingId, user.id);
    this.signalingGateway.emitToMeeting(meetingId, 'meeting.participant.left', {
      type: 'meeting.participant.left',
      meetingId,
      participant: data,
    });
    return { status: 'success', data };
  }

  @Post(':meetingId/end')
  async end(@Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string, @CurrentUser() user: AuthUser) {
    const data = await this.meetingsService.end(meetingId, user.id);
    this.signalingGateway.emitToMeeting(meetingId, 'meeting.host.ended', {
      type: 'meeting.host.ended',
      meetingId,
    });
    return { status: 'success', data };
  }

  @Patch(':meetingId/settings')
  async updateSettings(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMeetingSettingsDto,
  ) {
    const data = await this.meetingsService.updateSettings(meetingId, user.id, dto);
    return { status: 'success', data };
  }
}
