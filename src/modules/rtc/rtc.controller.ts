import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RtcService } from './rtc.service';

@ApiTags('rtc')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('rtc')
export class RtcController {
  constructor(private readonly rtcService: RtcService) {}

  @Get('ice')
  @ApiOperation({ summary: 'WebRTC ICE servers (Twilio TURN when configured)' })
  async ice() {
    const data = await this.rtcService.getIceServersForClient();
    return { status: 'success', data };
  }
}
