import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { JoinMeetingGuestDto } from './dto/join-meeting-guest.dto';
import { ResolveMeetingMongoIdPipe } from './resolve-meeting-mongo-id.pipe';
import { SignalingGateway } from '../signaling/signaling.gateway';

@ApiTags('meetings')
@Controller('meetings')
export class MeetingsPublicController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly signalingGateway: SignalingGateway,
  ) {}

  @Get(':meetingId/preview')
  @ApiOperation({ summary: 'Public meeting info for join screen (no auth)' })
  async preview(@Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string) {
    const data = await this.meetingsService.publicPreview(meetingId);
    return { status: 'success', data };
  }

  @Post(':meetingId/join-as-guest')
  @ApiOperation({ summary: 'Join a live meeting without a KeeTra account' })
  async joinAsGuest(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @Body() dto: JoinMeetingGuestDto,
  ) {
    const data = await this.meetingsService.joinAsGuest(meetingId, dto.displayName, dto.password);
    this.signalingGateway.emitToMeeting(meetingId, 'meeting.participant.joined', {
      type: 'meeting.participant.joined',
      meetingId,
      participant: data.participant,
    });
    if ((data.participant as { state?: string }).state === 'waiting') {
      this.signalingGateway.emitToMeeting(meetingId, 'meeting.waiting.new', {
        type: 'meeting.waiting.new',
        meetingId,
        participant: data.participant,
      });
    }
    return { status: 'success', data };
  }
}
