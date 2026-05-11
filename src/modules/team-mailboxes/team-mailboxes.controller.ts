import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { CreateTeamMailDomainDto } from './dto/create-team-mail-domain.dto';
import { CreateTeamMailboxDto } from './dto/create-team-mailbox.dto';
import { TeamMailboxesService } from './team-mailboxes.service';

@ApiTags('team-mail')
@Controller('teams')
export class TeamMailboxesController {
  constructor(private readonly teamMailboxes: TeamMailboxesService) {}

  @Get(':teamId/mail/client-config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  clientConfig(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser) {
    return this.teamMailboxes
      .getClientConfigForMember(teamId, user.id)
      .then((data) => ({ status: 'success' as const, data }));
  }

  @Get(':teamId/mail/domains')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  listDomains(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser) {
    return this.teamMailboxes.listDomains(teamId, user.id).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post(':teamId/mail/domains')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  addDomain(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTeamMailDomainDto,
  ) {
    return this.teamMailboxes.addDomain(teamId, user.id, dto).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post(':teamId/mail/domains/:domainId/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  verifyDomain(
    @Param('teamId') teamId: string,
    @Param('domainId') domainId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teamMailboxes.verifyDomain(teamId, user.id, domainId).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Delete(':teamId/mail/domains/:domainId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  deleteDomain(
    @Param('teamId') teamId: string,
    @Param('domainId') domainId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teamMailboxes.deleteDomain(teamId, user.id, domainId).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Get(':teamId/mail/mailboxes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  listMailboxes(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser) {
    return this.teamMailboxes.listMailboxes(teamId, user.id).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post(':teamId/mail/mailboxes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  createMailbox(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTeamMailboxDto,
  ) {
    return this.teamMailboxes.createMailbox(teamId, user.id, dto).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post(':teamId/mail/mailboxes/:mailboxId/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  disableMailbox(
    @Param('teamId') teamId: string,
    @Param('mailboxId') mailboxId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teamMailboxes.disableMailbox(teamId, user.id, mailboxId).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post(':teamId/mail/mailboxes/:mailboxId/reset-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  resetPassword(
    @Param('teamId') teamId: string,
    @Param('mailboxId') mailboxId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teamMailboxes.resetMailboxPassword(teamId, user.id, mailboxId).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }
}
