import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuestMeetingScopeGuard } from '../../common/guards/guest-meeting-scope.guard';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ChatService } from './chat.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { SignalingGateway } from '../signaling/signaling.gateway';
import { ResolveMeetingMongoIdPipe } from '../meetings/resolve-meeting-mongo-id.pipe';

@ApiTags('chat')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, GuestMeetingScopeGuard)
@Controller('meetings/:meetingId/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly signalingGateway: SignalingGateway,
  ) {}

  @Get('messages')
  async list(@Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string) {
    const data = await this.chatService.list(meetingId);
    return { status: 'success', data };
  }

  @Post('messages')
  async send(
    @Param('meetingId', ResolveMeetingMongoIdPipe) meetingId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SendChatMessageDto,
  ) {
    const message = await this.chatService.create(meetingId, user.id, dto.content);
    this.signalingGateway.emitToMeeting(meetingId, 'chat.message.new', {
      type: 'chat.message.new',
      meetingId,
      message,
    });
    return { status: 'success', data: message };
  }
}
