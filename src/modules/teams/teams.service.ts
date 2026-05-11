import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getAppPublicBaseUrl } from '../../common/util/app-public-url';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { Team, TeamDocument } from './schemas/team.schema';
import { TeamInvite, TeamInviteDocument } from './schemas/team-invite.schema';
import {
  TeamMember,
  TeamMemberDocument,
  TeamMemberRole,
} from './schemas/team-member.schema';

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private readonly teamModel: Model<TeamDocument>,
    @InjectModel(TeamMember.name) private readonly memberModel: Model<TeamMemberDocument>,
    @InjectModel(TeamInvite.name) private readonly inviteModel: Model<TeamInviteDocument>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  /** Sends the join link to the invitee’s inbox (SMTP / Gmail when configured). */
  private async sendTeamInviteEmail(params: {
    to: string;
    teamName: string;
    inviterName: string;
    token: string;
  }): Promise<void> {
    const base = getAppPublicBaseUrl(this.configService);
    const inviteUrl = `${base}/join-team?token=${encodeURIComponent(params.token)}`;
    const safeTeam = escapeHtml(params.teamName);
    const safeInviter = escapeHtml(params.inviterName);
    const safeTo = escapeHtml(params.to);
    const subject = `[KeeTra] You're invited to ${params.teamName}`;
    const text = [
      `${params.inviterName} invited you to join "${params.teamName}" on KeeTra.`,
      ``,
      `Accept the invitation (sign in with ${params.to} if prompted):`,
      inviteUrl,
      ``,
      `This invite expires in 14 days.`,
    ].join('\n');
    const html = `
      <p><strong>${safeInviter}</strong> invited you to join <strong>${safeTeam}</strong> on KeeTra.</p>
      <p><a href="${inviteUrl}">Accept invitation</a></p>
      <p style="color:#666;font-size:13px">Or copy this link:<br/><span style="word-break:break-all">${escapeHtml(
        inviteUrl,
      )}</span></p>
      <p style="color:#666;font-size:13px">You need to be signed in as <strong>${safeTo}</strong> to accept this invite.</p>
    `;
    await this.mailService.sendToEach([params.to], { subject, text, html });
  }

  private async assertTeamRole(
    teamId: string,
    userId: string,
    allowed: TeamMemberRole[],
  ): Promise<TeamMemberDocument> {
    const member = await this.memberModel.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(userId),
    });
    if (!member || !allowed.includes(member.role)) {
      throw new ForbiddenException('Not allowed for this team');
    }
    return member;
  }

  async create(ownerId: string, name: string, description?: string) {
    const team = await this.teamModel.create({
      name: name.trim(),
      description: description?.trim(),
      ownerId: new Types.ObjectId(ownerId),
    });
    await this.memberModel.create({
      teamId: team._id,
      userId: new Types.ObjectId(ownerId),
      role: 'owner',
    });
    return team;
  }

  async listForUser(userId: string) {
    const links = await this.memberModel
      .find({ userId: new Types.ObjectId(userId) })
      .lean();
    const teamIds = links.map((l) => l.teamId);
    const teams = await this.teamModel.find({ _id: { $in: teamIds } }).lean();
    const roleByTeam = new Map(links.map((l) => [l.teamId.toString(), l.role]));
    return teams.map((t) => ({
      ...t,
      myRole: roleByTeam.get(t._id.toString()),
    }));
  }

  /** Team ids the user belongs to (any role). */
  async listTeamIdsForUser(userId: string): Promise<string[]> {
    const links = await this.memberModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('teamId')
      .lean();
    return links.map((l) => l.teamId.toString());
  }

  async getTeamName(teamId: string): Promise<string | undefined> {
    const t = await this.teamModel.findById(teamId).select('name').lean();
    return t?.name;
  }

  /** Emails of all current members (deduped). */
  async listMemberEmails(teamId: string): Promise<string[]> {
    const rows = await this.memberModel.find({ teamId: new Types.ObjectId(teamId) }).lean();
    const emails: string[] = [];
    for (const r of rows) {
      const u = await this.usersService.findById(r.userId.toString()).exec();
      if (u?.email) emails.push(u.email);
    }
    return [...new Set(emails)];
  }

  async getTeam(teamId: string, userId: string) {
    await this.assertTeamRole(teamId, userId, ['owner', 'admin', 'member']);
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');
    const member = await this.memberModel.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(userId),
    });
    const base = getAppPublicBaseUrl(this.configService);
    const canManageShare =
      member?.role === 'owner' || member?.role === 'admin';
    const shareLinkUrl =
      canManageShare && team.shareLinkToken
        ? `${base}/join-team?token=${encodeURIComponent(team.shareLinkToken)}`
        : undefined;
    return { ...team.toObject(), myRole: member?.role, shareLinkUrl };
  }

  /** Creates a non-expiring team join link (until revoked). Owner or admin only. */
  async ensureShareLink(teamId: string, actorId: string) {
    await this.assertTeamRole(teamId, actorId, ['owner', 'admin']);
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');
    if (!team.shareLinkToken) {
      team.shareLinkToken = uuidv4();
      await team.save();
    }
    const base = getAppPublicBaseUrl(this.configService);
    const shareLinkUrl = `${base}/join-team?token=${encodeURIComponent(team.shareLinkToken)}`;
    return { ...team.toObject(), shareLinkUrl };
  }

  /** Revokes the persistent join link. Owner or admin only. */
  async revokeShareLink(teamId: string, actorId: string) {
    await this.assertTeamRole(teamId, actorId, ['owner', 'admin']);
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');
    team.shareLinkToken = undefined;
    await team.save();
    return { revoked: true as const };
  }

  async updateTeam(
    teamId: string,
    actorId: string,
    data: { name?: string; description?: string },
  ) {
    await this.assertTeamRole(teamId, actorId, ['owner', 'admin']);
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');
    if (data.name !== undefined) team.name = data.name.trim();
    if (data.description !== undefined) team.description = data.description.trim();
    await team.save();
    return team;
  }

  /** Any team member (including member role) — for chat & member-only reads. */
  async assertMembership(teamId: string, userId: string): Promise<void> {
    await this.assertTeamRole(teamId, userId, ['owner', 'admin', 'member']);
  }

  /** Owner or admin — invites, team settings, business mail admin. */
  async assertTeamManager(teamId: string, userId: string): Promise<void> {
    await this.assertTeamRole(teamId, userId, ['owner', 'admin']);
  }

  async listMembers(teamId: string, actorId: string) {
    await this.assertTeamRole(teamId, actorId, ['owner', 'admin', 'member']);
    const rows = await this.memberModel
      .find({ teamId: new Types.ObjectId(teamId) })
      .lean();
    const userIds = rows.map((r) => r.userId);
    const users = await Promise.all(userIds.map((id) => this.usersService.findById(id.toString())));
    const byId = new Map(users.filter(Boolean).map((u) => [u!._id.toString(), u!]));
    return rows.map((r) => {
      const u = byId.get(r.userId.toString());
      return {
        userId: r.userId.toString(),
        role: r.role,
        email: u?.email,
        displayName: u?.displayName,
        phone: u?.phone?.trim() || undefined,
        joinedAt: (r as { createdAt?: Date }).createdAt,
      };
    });
  }

  async inviteByEmail(teamId: string, actorId: string, email: string) {
    await this.assertTeamRole(teamId, actorId, ['owner', 'admin']);
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');

    const normalized = email.toLowerCase().trim();
    const inviter = await this.usersService.findById(actorId);
    const inviterName =
      inviter?.displayName?.trim() || inviter?.email || 'A teammate';
    const teamName = team.name.trim();

    const target = await this.usersService.findByEmail(normalized);

    if (target) {
      if (target.id === team.ownerId.toString()) {
        throw new BadRequestException('User is already the team owner');
      }
      const existing = await this.memberModel.findOne({
        teamId: new Types.ObjectId(teamId),
        userId: new Types.ObjectId(target.id),
      });
      if (existing) {
        throw new BadRequestException('User is already on this team');
      }
      await this.memberModel.create({
        teamId: new Types.ObjectId(teamId),
        userId: new Types.ObjectId(target.id),
        role: 'member',
      });
      return { kind: 'added' as const, email: normalized };
    }

    const openInvite = await this.inviteModel.findOne({
      teamId: new Types.ObjectId(teamId),
      email: normalized,
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (openInvite) {
      await this.sendTeamInviteEmail({
        to: normalized,
        teamName,
        inviterName,
        token: openInvite.token,
      });
      return {
        kind: 'invited' as const,
        email: normalized,
        token: openInvite.token,
        expiresAt: openInvite.expiresAt.toISOString(),
      };
    }

    const token = uuidv4();
    const inv = await this.inviteModel.create({
      teamId: new Types.ObjectId(teamId),
      email: normalized,
      token,
      invitedBy: new Types.ObjectId(actorId),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    await this.sendTeamInviteEmail({
      to: normalized,
      teamName,
      inviterName,
      token: inv.token,
    });

    return {
      kind: 'invited' as const,
      email: normalized,
      token: inv.token,
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  async previewInvite(token: string) {
    const inv = await this.inviteModel.findOne({ token });
    if (inv && !inv.usedAt && inv.expiresAt >= new Date()) {
      const team = await this.teamModel.findById(inv.teamId);
      if (!team) throw new NotFoundException('Team not found');
      return {
        teamName: team.name,
        email: inv.email,
        inviteKind: 'email' as const,
      };
    }

    const teamByShare = await this.teamModel.findOne({ shareLinkToken: token });
    if (teamByShare) {
      return {
        teamName: teamByShare.name,
        email: null,
        inviteKind: 'share' as const,
      };
    }

    throw new NotFoundException('Invite not found or expired');
  }

  async acceptInvite(token: string, userId: string, userEmail: string) {
    const inv = await this.inviteModel.findOne({ token });
    if (inv) {
      if (inv.usedAt || inv.expiresAt < new Date()) {
        throw new BadRequestException('Invite not found or expired');
      }
      if (inv.email !== userEmail.toLowerCase().trim()) {
        throw new ForbiddenException('This invite is for a different email address');
      }

      const existing = await this.memberModel.findOne({
        teamId: inv.teamId,
        userId: new Types.ObjectId(userId),
      });
      if (existing) {
        inv.usedAt = new Date();
        await inv.save();
        throw new BadRequestException('You are already a member of this team');
      }

      await this.memberModel.create({
        teamId: inv.teamId,
        userId: new Types.ObjectId(userId),
        role: 'member',
      });
      inv.usedAt = new Date();
      await inv.save();

      return this.teamModel.findById(inv.teamId);
    }

    const teamByShare = await this.teamModel.findOne({ shareLinkToken: token });
    if (teamByShare) {
      const existing = await this.memberModel.findOne({
        teamId: teamByShare._id,
        userId: new Types.ObjectId(userId),
      });
      if (existing) {
        return teamByShare;
      }
      await this.memberModel.create({
        teamId: teamByShare._id,
        userId: new Types.ObjectId(userId),
        role: 'member',
      });
      return teamByShare;
    }

    throw new BadRequestException('Invite not found or expired');
  }

  /** Ensures every id is a current member of the team (for @mentions). */
  async assertUserIdsAreTeamMembers(teamId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    const unique = [...new Set(userIds)];
    const count = await this.memberModel.countDocuments({
      teamId: new Types.ObjectId(teamId),
      userId: { $in: unique.map((id) => new Types.ObjectId(id)) },
    });
    if (count !== unique.length) {
      throw new BadRequestException('One or more mentions are not valid team members');
    }
  }

  async removeMember(teamId: string, actorId: string, memberUserId: string) {
    await this.assertTeamRole(teamId, actorId, ['owner', 'admin']);
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');
    if (memberUserId === team.ownerId.toString()) {
      throw new ForbiddenException('Cannot remove the team owner');
    }
    const target = await this.memberModel.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(memberUserId),
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'admin' && actorId !== team.ownerId.toString()) {
      throw new ForbiddenException('Only the owner can remove an admin');
    }
    await this.memberModel.deleteOne({ _id: target._id });
    return { removed: true };
  }
}
