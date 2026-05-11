import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { SendTeamChatDto } from './dto/send-team-chat.dto';
import { TeamsService } from './teams.service';
import { TeamChatService } from './team-chat.service';
import { SignalingGateway } from '../signaling/signaling.gateway';

const TEAM_CHAT_MAX_BYTES = 12 * 1024 * 1024;

function safeUploadBasename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return base || 'file';
}

@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly teamChatService: TeamChatService,
    private readonly signalingGateway: SignalingGateway,
  ) {}

  @Get('invites/preview')
  @ApiQuery({ name: 'token', required: true })
  preview(@Query('token') token: string) {
    return this.teamsService.previewInvite(token).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Post('invites/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  accept(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptInviteDto,
  ) {
    return this.teamsService
      .acceptInvite(dto.token, user.id, user.email)
      .then((data) => ({ status: 'success', data }));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTeamDto) {
    return this.teamsService
      .create(user.id, dto.name, dto.description)
      .then((data) => ({ status: 'success', data }));
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  list(@CurrentUser() user: AuthUser) {
    return this.teamsService.listForUser(user.id).then((data) => ({
      status: 'success',
      data,
    }));
  }

  /** Nested routes must be registered before `@Get(':teamId')` so they are not shadowed. */
  @Get(':teamId/chat/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiQuery({ name: 'before', required: false })
  @ApiQuery({ name: 'limit', required: false })
  teamChatList(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : undefined;
    return this.teamChatService
      .listMessages(teamId, user.id, {
        before,
        limit: Number.isFinite(lim) ? lim : undefined,
      })
      .then((data) => ({ status: 'success', data }));
  }

  @Post(':teamId/chat/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  async teamChatSend(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SendTeamChatDto,
  ) {
    const message = await this.teamChatService.createMessage(teamId, user.id, dto);
    this.signalingGateway.emitToTeam(teamId, 'team.chat.message.new', {
      type: 'team.chat.message.new',
      teamId,
      message,
    });
    return { status: 'success', data: message };
  }

  @Post(':teamId/chat/upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const tid = req.params['teamId'] as string;
          const dir = join(process.cwd(), 'uploads', 'team-chat', tid);
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}-${safeUploadBasename(file.originalname)}`);
        },
      }),
      limits: { fileSize: TEAM_CHAT_MAX_BYTES },
    }),
  )
  async teamChatUpload(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const data = await this.teamChatService.registerAttachment(teamId, user.id, file);
    return { status: 'success', data };
  }

  @Get(':teamId/chat/files/:attachmentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  async teamChatFile(
    @Param('teamId') teamId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const { stream, mimeType, filename } = await this.teamChatService.getAttachmentFile(
      teamId,
      attachmentId,
      user.id,
    );
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  }

  @Get(':teamId/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  members(@CurrentUser() user: AuthUser, @Param('teamId') teamId: string) {
    return this.teamsService.listMembers(teamId, user.id).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Post(':teamId/invites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  invite(
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.teamsService
      .inviteByEmail(teamId, user.id, dto.email)
      .then((data) => ({ status: 'success', data }));
  }

  @Delete(':teamId/members/:memberUserId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Param('memberUserId') memberUserId: string,
  ) {
    return this.teamsService
      .removeMember(teamId, user.id, memberUserId)
      .then((data) => ({ status: 'success', data }));
  }

  @Patch(':teamId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  update(
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService
      .updateTeam(teamId, user.id, dto)
      .then((data) => ({ status: 'success', data }));
  }

  @Post(':teamId/share-link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  ensureShareLink(@CurrentUser() user: AuthUser, @Param('teamId') teamId: string) {
    return this.teamsService
      .ensureShareLink(teamId, user.id)
      .then((data) => ({ status: 'success', data }));
  }

  @Delete(':teamId/share-link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  revokeShareLink(@CurrentUser() user: AuthUser, @Param('teamId') teamId: string) {
    return this.teamsService
      .revokeShareLink(teamId, user.id)
      .then((data) => ({ status: 'success', data }));
  }

  @Get(':teamId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  get(@CurrentUser() user: AuthUser, @Param('teamId') teamId: string) {
    return this.teamsService.getTeam(teamId, user.id).then((data) => ({
      status: 'success',
      data,
    }));
  }
}
