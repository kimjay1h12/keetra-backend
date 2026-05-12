import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RejectMeetingGuestGuard } from '../../common/guards/reject-meeting-guest.guard';
import { AiService } from './ai.service';
import { AiChatStreamDto } from './dto/ai-chat-stream.dto';

@ApiTags('ai')
@ApiBearerAuth('JWT-auth')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @UseGuards(JwtAuthGuard, RejectMeetingGuestGuard)
  @Post('chat/stream')
  async streamChat(
    @Body() dto: AiChatStreamDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.aiService.proxyChatStream(dto.messages, res);
  }
}
