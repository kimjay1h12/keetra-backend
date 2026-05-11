import { Controller, Get, Param, Patch, Post, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParticipantsService } from './participants.service';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SignalingGateway } from '../signaling/signaling.gateway';
import { ResolveMeetingMongoIdPipe } from '../meetings/resolve-meeting-mongo-id.pipe';
import { MeetingsService } from '../meetings/meetings.service';

@ApiTags('participants')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('meetings/:meetingId')
export class ParticipantsController {
  constructor(
    private readonly participantsService: ParticipantsService,
    private readonly signalingGateway: SignalingGateway,
    private readonly meetingsService: MeetingsService,
  ) {}

  @Get('waiting-room')
  async waitingRoom(@Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string, @CurrentUser() user: AuthUser) {
    await this.participantsService.ensureModerator(meetingId, user.id);
    const data = await this.participantsService.listWaiting(meetingId);
    return { status: 'success', data };
  }

  @Post('waiting-room/:participantId/admit')
  async admit(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.participantsService.ensureModerator(meetingId, user.id);
    const data = await this.participantsService.admitParticipant(meetingId, participantId);
    this.signalingGateway.emitToMeeting(meetingId, 'meeting.waiting.admitted', {
      type: 'meeting.waiting.admitted',
      meetingId,
      participant: data,
    });
    await this.meetingsService.syncEmptyRoomTimer(meetingId);
    return { status: 'success', data };
  }

  @Post('waiting-room/:participantId/reject')
  async reject(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.participantsService.ensureModerator(meetingId, user.id);
    const data = await this.participantsService.rejectParticipant(meetingId, participantId);
    this.signalingGateway.emitToMeeting(meetingId, 'meeting.waiting.rejected', {
      type: 'meeting.waiting.rejected',
      meetingId,
      participant: data,
    });
    await this.meetingsService.syncEmptyRoomTimer(meetingId);
    return { status: 'success', data };
  }

  @Get('participants')
  async listParticipants(@Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string, @CurrentUser() _user: AuthUser) {
    const data = await this.participantsService.listParticipants(meetingId);
    return { status: 'success', data };
  }

  @Post('participants/:participantId/mute')
  async mute(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.participantsService.ensureModerator(meetingId, user.id);
    const data = await this.participantsService.updateMuteState(meetingId, participantId, true);
    this.signalingGateway.emitToMeeting(meetingId, 'participant.media.updated', {
      type: 'participant.media.updated',
      meetingId,
      participant: data,
    });
    return { status: 'success', data };
  }

  @Post('participants/:participantId/unmute')
  async unmute(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.participantsService.ensureModerator(meetingId, user.id);
    const data = await this.participantsService.updateMuteState(meetingId, participantId, false);
    this.signalingGateway.emitToMeeting(meetingId, 'participant.media.updated', {
      type: 'participant.media.updated',
      meetingId,
      participant: data,
    });
    return { status: 'success', data };
  }

  @Post('participants/:participantId/remove')
  async remove(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.participantsService.ensureModerator(meetingId, user.id);
    const data = await this.participantsService.removeParticipant(meetingId, participantId);
    this.signalingGateway.emitToMeeting(meetingId, 'meeting.participant.left', {
      type: 'meeting.participant.left',
      meetingId,
      participant: data,
    });
    await this.meetingsService.syncEmptyRoomTimer(meetingId);
    return { status: 'success', data };
  }

  @Patch('participants/:participantId/role')
  async role(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateRoleDto,
  ) {
    await this.participantsService.ensureModerator(meetingId, user.id);
    const data = await this.participantsService.updateRole(meetingId, participantId, dto.role);
    return { status: 'success', data };
  }
}
