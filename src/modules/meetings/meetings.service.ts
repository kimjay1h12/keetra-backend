import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Meeting, MeetingDocument } from './schemas/meeting.schema';
import { ParticipantRole, ParticipantState } from '../participants/schemas/participant.schema';
import { ParticipantsService } from '../participants/participants.service';
import { TeamsService } from '../teams/teams.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { SignalingGateway } from '../signaling/signaling.gateway';
import { AuthService } from '../auth/auth.service';
import { getAppPublicBaseUrl } from '../../common/util/app-public-url';

const MEETING_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MEETING_CODE_LEN = 9;
const MEETING_CODE_RE = /^[A-Z0-9]{9}$/;
/** End live meetings when nobody has been in `joined` state for this long. */
const LIVE_EMPTY_AUTO_END_MS = 120_000;
const IDLE_SHUTDOWN_POLL_MS = 30_000;

interface CreateMeetingInput {
  title: string;
  visibility: 'public' | 'private';
  password?: string;
  waitingRoomEnabled?: boolean;
  scheduledAt?: string;
  teamId?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrenceUntil?: string;
}

@Injectable()
export class MeetingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingsService.name);
  private idleShutdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectModel(Meeting.name) private readonly meetingModel: Model<MeetingDocument>,
    private readonly participantsService: ParticipantsService,
    private readonly teamsService: TeamsService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly signalingGateway: SignalingGateway,
    private readonly authService: AuthService,
  ) {}

  onModuleInit() {
    this.idleShutdownTimer = setInterval(() => {
      void this.shutdownIdleLiveMeetings().catch((err) =>
        this.logger.error('shutdownIdleLiveMeetings failed', err),
      );
    }, IDLE_SHUTDOWN_POLL_MS);
  }

  onModuleDestroy() {
    if (this.idleShutdownTimer) {
      clearInterval(this.idleShutdownTimer);
      this.idleShutdownTimer = null;
    }
  }

  private formatScheduleLabel(d: Date): string {
    try {
      return d.toLocaleString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return d.toISOString();
    }
  }

  private endOfUtcDayFromYmd(ymd: string): Date {
    const parts = ymd.split('-').map((x) => parseInt(x, 10));
    const y = parts[0];
    const mo = parts[1];
    const day = parts[2];
    if (!y || !mo || !day || parts.length !== 3) {
      throw new BadRequestException('Invalid recurrenceUntil');
    }
    return new Date(Date.UTC(y, mo - 1, day, 23, 59, 59, 999));
  }

  private nextRecurrenceDate(from: Date, frequency: 'daily' | 'weekly' | 'monthly'): Date {
    const d = new Date(from.getTime());
    switch (frequency) {
      case 'daily':
        d.setUTCDate(d.getUTCDate() + 1);
        return d;
      case 'weekly':
        d.setUTCDate(d.getUTCDate() + 7);
        return d;
      case 'monthly':
        d.setUTCMonth(d.getUTCMonth() + 1);
        return d;
      default:
        return d;
    }
  }

  private recurrenceDescription(
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly',
    until?: Date,
  ): string {
    if (recurrence === 'none') return '';
    const freq =
      recurrence === 'daily'
        ? 'daily'
        : recurrence === 'weekly'
          ? 'weekly'
          : recurrence === 'monthly'
            ? 'monthly'
            : '';
    const untilPart = until ? ` until ${this.formatScheduleLabel(until)}` : '';
    return `Repeats ${freq}${untilPart}.`;
  }

  private async spawnRecurringFollowUp(
    ended: MeetingDocument,
    hostId: string,
    nextScheduledAt: Date,
  ) {
    const rec = ended.recurrence ?? 'none';
    if (rec === 'none') return;

    const code = await this.generateUniqueCode();
    const next = await this.meetingModel.create({
      title: ended.title,
      hostId: ended.hostId,
      visibility: ended.visibility,
      passwordHash: ended.passwordHash,
      code,
      waitingRoomEnabled: ended.waitingRoomEnabled,
      chatEnabled: ended.chatEnabled ?? true,
      status: 'scheduled',
      scheduledAt: nextScheduledAt,
      teamId: ended.teamId,
      recurrence: rec,
      recurrenceUntil: ended.recurrenceUntil,
    });
    void this.notifyTeamScheduledMeeting(next, hostId).catch((err) =>
      this.logger.error('notifyTeamScheduledMeeting (recurrence) failed', err),
    );
  }

  async create(hostId: string, input: CreateMeetingInput) {
    let scheduledAt: Date | undefined;
    if (input.scheduledAt) {
      const d = new Date(input.scheduledAt);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid scheduledAt');
      }
      scheduledAt = d;
    }

    let teamOid: Types.ObjectId | undefined;
    if (input.teamId) {
      await this.teamsService.assertMembership(input.teamId, hostId);
      teamOid = new Types.ObjectId(input.teamId);
    }

    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
    const code = await this.generateUniqueCode();
    const now = new Date();
    const effectiveScheduled = scheduledAt && scheduledAt > now ? scheduledAt : undefined;
    const isFutureSchedule = Boolean(effectiveScheduled);

    const recurrence: 'none' | 'daily' | 'weekly' | 'monthly' =
      input.recurrence && input.recurrence !== 'none' ? input.recurrence : 'none';
    let recurrenceUntilDate: Date | undefined;
    if (input.recurrenceUntil?.trim()) {
      recurrenceUntilDate = this.endOfUtcDayFromYmd(input.recurrenceUntil.trim());
    }
    if (recurrence !== 'none') {
      if (!isFutureSchedule) {
        throw new BadRequestException('Recurring meetings must be scheduled for a future time');
      }
      if (!teamOid) {
        throw new BadRequestException('Recurring meetings must be linked to a team for member notifications');
      }
      if (recurrenceUntilDate && recurrenceUntilDate.getTime() < effectiveScheduled!.getTime()) {
        throw new BadRequestException('recurrenceUntil must be on or after the first meeting time');
      }
    }

    const meeting = await this.meetingModel.create({
      title: input.title.trim(),
      hostId: new Types.ObjectId(hostId),
      visibility: input.visibility,
      passwordHash,
      code,
      waitingRoomEnabled:
        typeof input.waitingRoomEnabled === 'boolean'
          ? input.waitingRoomEnabled
          : input.visibility === 'private',
      chatEnabled: true,
      status: isFutureSchedule ? 'scheduled' : 'live',
      scheduledAt: effectiveScheduled,
      teamId: teamOid,
      recurrence,
      recurrenceUntil: recurrenceUntilDate,
    });

    if (!isFutureSchedule) {
      await this.participantsService.upsertHostParticipant(meeting.id, hostId);
      await this.syncEmptyRoomTimer(meeting.id.toString());
    } else {
      void this.notifyTeamScheduledMeeting(meeting, hostId).catch((err) =>
        this.logger.error('notifyTeamScheduledMeeting failed', err),
      );
    }

    return meeting;
  }

  private async notifyTeamScheduledMeeting(meeting: MeetingDocument, hostId: string) {
    if (!meeting.teamId || meeting.status !== 'scheduled' || !meeting.scheduledAt) return;

    const teamId = meeting.teamId.toString();
    const recipients = await this.teamsService.listMemberEmails(teamId);
    const host = await this.usersService.findById(hostId).exec();
    const hostEmail = host?.email?.toLowerCase();
    const filtered = recipients.filter((e) => e.toLowerCase() !== hostEmail);
    if (!filtered.length) return;

    const teamName = (await this.teamsService.getTeamName(teamId)) ?? 'Your team';
    const base = getAppPublicBaseUrl(this.configService);
    const joinUrl = `${base}/meeting/${meeting.code}`;
    const when = this.formatScheduleLabel(meeting.scheduledAt);
    const hostLabel = host?.displayName?.trim() || host?.email || 'Host';
    const repeatLine = this.recurrenceDescription(
      meeting.recurrence ?? 'none',
      meeting.recurrenceUntil,
    );

    const subject = `[KeeTra] ${meeting.title} — ${when}`;
    const textLines = [
      `${hostLabel} scheduled a meeting for ${teamName}.`,
      ``,
      `Time: ${when}`,
    ];
    if (repeatLine) {
      textLines.push(repeatLine, ``);
    }
    textLines.push(
      `Join (when the host starts): ${joinUrl}`,
      ``,
      `Meeting code: ${meeting.code}`,
    );
    const text = textLines.join('\n');

    const html = `
      <p><strong>${hostLabel}</strong> scheduled a meeting for <strong>${teamName}</strong>.</p>
      <p><strong>When:</strong> ${when}</p>
      ${repeatLine ? `<p>${repeatLine}</p>` : ''}
      <p><a href="${joinUrl}">Open meeting link</a> (join when the host has started the room)</p>
      <p style="color:#666;font-size:13px">Code: <code>${meeting.code}</code></p>
    `;

    await this.mailService.sendToEach(filtered, { subject, text, html });
  }

  private randomMeetingCode(): string {
    const buf = randomBytes(MEETING_CODE_LEN);
    let out = '';
    for (let i = 0; i < MEETING_CODE_LEN; i++) {
      out += MEETING_CODE_CHARS[buf[i]! % MEETING_CODE_CHARS.length];
    }
    return out;
  }

  async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 48; attempt++) {
      const code = this.randomMeetingCode();
      const exists = await this.meetingModel.exists({ code });
      if (!exists) {
        return code;
      }
    }
    throw new Error('Could not allocate a unique meeting code');
  }

  /**
   * Public API ref: 9-char code (A-Z, 0-9) or legacy 24-char hex MongoDB id.
   * Returns canonical MongoDB ObjectId string for DB joins.
   */
  async resolveToMongoId(ref: string): Promise<string> {
    const trimmed = ref?.trim() ?? '';
    if (!trimmed) {
      throw new NotFoundException('Meeting not found');
    }

    const upper = trimmed.toUpperCase();
    if (MEETING_CODE_RE.test(upper)) {
      const meeting = await this.meetingModel.findOne({ code: upper });
      if (!meeting) {
        throw new NotFoundException('Meeting not found');
      }
      return meeting._id.toString();
    }

    if (Types.ObjectId.isValid(trimmed) && trimmed.length === 24) {
      const meeting = await this.meetingModel.findById(trimmed);
      if (!meeting) {
        throw new NotFoundException('Meeting not found');
      }
      await this.ensureMeetingHasCode(meeting);
      return meeting._id.toString();
    }

    throw new NotFoundException('Meeting not found');
  }

  async ensureMeetingHasCode(meeting: MeetingDocument): Promise<void> {
    if (meeting.code) {
      return;
    }
    meeting.code = await this.generateUniqueCode();
    await meeting.save();
  }

  async findById(meetingId: string) {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    await this.ensureMeetingHasCode(meeting);
    return meeting;
  }

  async publicPreview(meetingId: string) {
    const meeting = await this.findById(meetingId);
    const hosts = await this.usersService.findPublicRowsByIds([meeting.hostId.toString()]);
    const hostDisplayName = hosts[0]?.displayName?.trim() ? hosts[0].displayName.trim() : null;
    return {
      _id: meeting.id,
      code: meeting.code,
      title: meeting.title,
      hostId: meeting.hostId.toString(),
      visibility: meeting.visibility,
      waitingRoomEnabled: meeting.waitingRoomEnabled,
      chatEnabled: meeting.chatEnabled,
      locked: meeting.locked,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt?.toISOString?.(),
      teamId: meeting.teamId?.toString(),
      recurrence: meeting.recurrence,
      recurrenceUntil: meeting.recurrenceUntil?.toISOString?.(),
      createdAt:
        'createdAt' in meeting && meeting.createdAt instanceof Date
          ? meeting.createdAt.toISOString()
          : undefined,
      updatedAt:
        'updatedAt' in meeting && meeting.updatedAt instanceof Date
          ? meeting.updatedAt.toISOString()
          : undefined,
      hostDisplayName,
    };
  }

  async listForUser(userId: string) {
    const teamIds = await this.teamsService.listTeamIdsForUser(userId);
    const uid = new Types.ObjectId(userId);
    const orClause: Record<string, unknown>[] = [{ hostId: uid }, { status: 'live' }];
    if (teamIds.length > 0) {
      orClause.push({
        teamId: { $in: teamIds.map((id) => new Types.ObjectId(id)) },
      });
    }

    const meetings = await this.meetingModel.find({ $or: orClause }).sort({
      scheduledAt: 1,
      createdAt: -1,
    });
    for (const m of meetings) {
      await this.ensureMeetingHasCode(m);
    }
    return meetings;
  }

  async join(meetingId: string, userId: string, password?: string) {
    const meeting = await this.findById(meetingId);

    if (meeting.status === 'ended') {
      throw new ForbiddenException('Meeting has ended');
    }

    if (meeting.status === 'scheduled') {
      if (meeting.hostId.toString() !== userId) {
        throw new ForbiddenException('This meeting has not started yet');
      }
      meeting.status = 'live';
      await meeting.save();
    }

    if (meeting.visibility === 'private') {
      if (!password || !meeting.passwordHash) {
        throw new UnauthorizedException('Meeting password required');
      }
      const valid = await bcrypt.compare(password, meeting.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Invalid meeting password');
      }
    }

    const current = await this.participantsService.findByMeetingAndUser(meetingId, userId);
    if (current?.state === 'removed') {
      throw new ForbiddenException('You are removed from this meeting');
    }

    const isHost = meeting.hostId.toString() === userId;
    const hostAlreadyInCall = await this.participantsService.isHostJoined(
      meetingId,
      meeting.hostId.toString(),
    );
    const nextState: ParticipantState =
      isHost ? 'joined' : meeting.waitingRoomEnabled && !hostAlreadyInCall ? 'waiting' : 'joined';
    const role: ParticipantRole = isHost ? 'host' : 'participant';
    const participant = await this.participantsService.createOrUpdateParticipant(
      meetingId,
      userId,
      nextState,
      role,
    );
    await this.syncEmptyRoomTimer(meetingId);
    return participant;
  }

  async joinAsGuest(meetingId: string, displayName: string, password?: string) {
    const meeting = await this.findById(meetingId);

    if (meeting.status === 'ended') {
      throw new ForbiddenException('Meeting has ended');
    }

    if (meeting.status === 'scheduled') {
      throw new ForbiddenException('This meeting has not started yet');
    }

    if (meeting.visibility === 'private') {
      if (!password || !meeting.passwordHash) {
        throw new UnauthorizedException('Meeting password required');
      }
      const valid = await bcrypt.compare(password, meeting.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Invalid meeting password');
      }
    }

    const guestId = new Types.ObjectId().toString();
    const current = await this.participantsService.findByMeetingAndUser(meetingId, guestId);
    if (current?.state === 'removed') {
      throw new ForbiddenException('You are removed from this meeting');
    }

    const hostAlreadyInCall = await this.participantsService.isHostJoined(
      meetingId,
      meeting.hostId.toString(),
    );
    const nextState: ParticipantState =
      meeting.waitingRoomEnabled && !hostAlreadyInCall ? 'waiting' : 'joined';
    await this.participantsService.createOrUpdateGuestParticipant(
      meetingId,
      guestId,
      nextState,
      'participant',
      displayName,
    );
    await this.syncEmptyRoomTimer(meetingId);
    const rows = await this.participantsService.listParticipants(meetingId);
    const mine = rows.find((p) => String((p as Record<string, unknown>).userId) === guestId);
    if (!mine) {
      throw new NotFoundException('Participant not found after join');
    }
    const accessToken = await this.authService.signMeetingGuestAccessToken(guestId, meetingId);
    return { participant: mine, accessToken };
  }

  async leave(meetingId: string, userId: string) {
    await this.findById(meetingId);
    const row = await this.participantsService.setJoinState(meetingId, userId, 'left');
    await this.syncEmptyRoomTimer(meetingId);
    return row;
  }

  private scheduleRecurringIfNeeded(meeting: MeetingDocument, hostId: string) {
    const rec = meeting.recurrence ?? 'none';
    const anchor = meeting.scheduledAt;
    const until = meeting.recurrenceUntil;
    if (rec === 'none' || !anchor) return;
    const nextAt = this.nextRecurrenceDate(anchor, rec);
    if (until && nextAt.getTime() > until.getTime()) return;
    void this.spawnRecurringFollowUp(meeting, hostId, nextAt).catch((e) =>
      this.logger.error('spawnRecurringFollowUp failed', e),
    );
  }

  async end(meetingId: string, userId: string) {
    const meeting = await this.findById(meetingId);
    if (meeting.hostId.toString() !== userId) {
      throw new ForbiddenException('Only host can end the meeting');
    }

    meeting.status = 'ended';
    meeting.set('emptySince', undefined);
    await meeting.save();

    this.scheduleRecurringIfNeeded(meeting, userId);

    return meeting;
  }

  /**
   * Live meetings with zero `joined` participants get `emptySince` set (once).
   * When someone is `joined` again, `emptySince` is cleared so the 2-minute idle window restarts only after the next empty period.
   */
  async syncEmptyRoomTimer(meetingId: string): Promise<void> {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting || meeting.status !== 'live') return;

    const joined = await this.participantsService.countJoinedForMeeting(meetingId);
    if (joined === 0) {
      if (!meeting.emptySince) {
        meeting.emptySince = new Date();
        await meeting.save();
      }
    } else if (meeting.emptySince != null) {
      meeting.set('emptySince', undefined);
      await meeting.save();
    }
  }

  /** Ends live meetings that have been empty (no joined participants) for {@link LIVE_EMPTY_AUTO_END_MS}. */
  async shutdownIdleLiveMeetings(): Promise<void> {
    const cutoff = new Date(Date.now() - LIVE_EMPTY_AUTO_END_MS);
    const stale = await this.meetingModel.find({
      status: 'live',
      emptySince: { $exists: true, $lte: cutoff },
    });
    for (const m of stale) {
      m.status = 'ended';
      m.set('emptySince', undefined);
      await m.save();
      const mid = m.id.toString();
      this.scheduleRecurringIfNeeded(m, m.hostId.toString());
      this.signalingGateway.emitToMeeting(mid, 'meeting.host.ended', {
        type: 'meeting.host.ended',
        meetingId: mid,
        reason: 'empty_room_timeout',
      });
    }
  }

  async updateSettings(
    meetingId: string,
    userId: string,
    settings: {
      locked?: boolean;
      waitingRoomEnabled?: boolean;
      chatEnabled?: boolean;
      password?: string;
    },
  ) {
    const meeting = await this.findById(meetingId);
    if (meeting.hostId.toString() !== userId) {
      throw new ForbiddenException('Only host can update settings');
    }
    if (typeof settings.locked === 'boolean') meeting.locked = settings.locked;
    if (typeof settings.waitingRoomEnabled === 'boolean') {
      meeting.waitingRoomEnabled = settings.waitingRoomEnabled;
    }
    if (typeof settings.chatEnabled === 'boolean') meeting.chatEnabled = settings.chatEnabled;
    if (settings.password !== undefined && settings.password.trim().length > 0) {
      if (meeting.visibility !== 'private') {
        throw new BadRequestException('Meeting password applies only to private meetings');
      }
      meeting.passwordHash = await bcrypt.hash(settings.password.trim(), 10);
    }
    await meeting.save();
    return meeting;
  }
}
