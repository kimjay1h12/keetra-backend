import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Participant,
  ParticipantDocument,
  ParticipantRole,
  ParticipantState,
} from './schemas/participant.schema';
import { Meeting, MeetingDocument } from '../meetings/schemas/meeting.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class ParticipantsService {
  constructor(
    @InjectModel(Participant.name) private readonly participantModel: Model<ParticipantDocument>,
    @InjectModel(Meeting.name) private readonly meetingModel: Model<MeetingDocument>,
    private readonly usersService: UsersService,
  ) {}

  private async enrichParticipants(rows: ParticipantDocument[]) {
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.userId.toString()))];
    const users = await Promise.all(ids.map((id) => this.usersService.findById(id)));
    const map = new Map(users.filter(Boolean).map((u) => [u!.id, u!]));
    return rows.map((r) => {
      const plain = r.toJSON() as unknown as Record<string, unknown>;
      const u = map.get(r.userId.toString());
      const guestName = typeof plain.guestDisplayName === 'string' ? plain.guestDisplayName.trim() : '';
      return {
        ...plain,
        displayName: guestName || u?.displayName?.trim() || null,
        avatarUrl: u?.avatarUrl?.trim() ? u.avatarUrl.trim() : null,
        title: u?.title?.trim() ? u.title.trim() : null,
      };
    });
  }

  async upsertHostParticipant(meetingId: string, hostId: string) {
    return this.participantModel.findOneAndUpdate(
      { meetingId: new Types.ObjectId(meetingId), userId: new Types.ObjectId(hostId) },
      { role: 'host', state: 'joined' },
      { upsert: true, new: true },
    );
  }

  async countJoinedForMeeting(meetingId: string): Promise<number> {
    return this.participantModel.countDocuments({
      meetingId: new Types.ObjectId(meetingId),
      state: 'joined',
    });
  }

  /** True when the meeting host is already in the call (so new guests need not sit in the waiting room). */
  async isHostJoined(meetingId: string, hostUserId: string): Promise<boolean> {
    const doc = await this.participantModel.findOne({
      meetingId: new Types.ObjectId(meetingId),
      userId: new Types.ObjectId(hostUserId),
      role: 'host',
      state: 'joined',
    });
    return Boolean(doc);
  }

  async findByMeetingAndUser(meetingId: string, userId: string) {
    return this.participantModel.findOne({
      meetingId: new Types.ObjectId(meetingId),
      userId: new Types.ObjectId(userId),
    });
  }

  async setJoinState(meetingId: string, userId: string, state: ParticipantState) {
    return this.participantModel.findOneAndUpdate(
      { meetingId: new Types.ObjectId(meetingId), userId: new Types.ObjectId(userId) },
      { state },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async createOrUpdateParticipant(
    meetingId: string,
    userId: string,
    state: ParticipantState,
    role: ParticipantRole = 'participant',
  ) {
    return this.participantModel.findOneAndUpdate(
      { meetingId: new Types.ObjectId(meetingId), userId: new Types.ObjectId(userId) },
      { state, role, $unset: { guestDisplayName: '' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async createOrUpdateGuestParticipant(
    meetingId: string,
    guestUserId: string,
    state: ParticipantState,
    role: ParticipantRole,
    guestDisplayName: string,
  ) {
    const name = guestDisplayName.trim().slice(0, 80);
    return this.participantModel.findOneAndUpdate(
      { meetingId: new Types.ObjectId(meetingId), userId: new Types.ObjectId(guestUserId) },
      { state, role, guestDisplayName: name },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async ensureModerator(meetingId: string, userId: string) {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.hostId.toString() === userId) {
      return meeting;
    }

    const participant = await this.findByMeetingAndUser(meetingId, userId);
    if (!participant || !['host', 'cohost'].includes(participant.role)) {
      throw new ForbiddenException('Only host or cohost can perform this action');
    }
    return meeting;
  }

  async listParticipants(meetingId: string) {
    const rows = await this.participantModel.find({
      meetingId: new Types.ObjectId(meetingId),
    });
    return this.enrichParticipants(rows);
  }

  async listWaiting(meetingId: string) {
    const rows = await this.participantModel.find({
      meetingId: new Types.ObjectId(meetingId),
      state: 'waiting',
    });
    return this.enrichParticipants(rows);
  }

  async admitParticipant(meetingId: string, participantId: string) {
    const participant = await this.participantModel.findOneAndUpdate(
      { _id: new Types.ObjectId(participantId), meetingId: new Types.ObjectId(meetingId) },
      { state: 'joined' },
      { new: true },
    );
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async rejectParticipant(meetingId: string, participantId: string) {
    const participant = await this.participantModel.findOneAndUpdate(
      { _id: new Types.ObjectId(participantId), meetingId: new Types.ObjectId(meetingId) },
      { state: 'removed' },
      { new: true },
    );
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async updateMuteState(meetingId: string, participantId: string, muted: boolean) {
    const participant = await this.participantModel.findOneAndUpdate(
      { _id: new Types.ObjectId(participantId), meetingId: new Types.ObjectId(meetingId) },
      { audioMuted: muted },
      { new: true },
    );
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async removeParticipant(meetingId: string, participantId: string) {
    const participant = await this.participantModel.findOneAndUpdate(
      { _id: new Types.ObjectId(participantId), meetingId: new Types.ObjectId(meetingId) },
      { state: 'removed' },
      { new: true },
    );
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async updateRole(meetingId: string, participantId: string, role: ParticipantRole) {
    const participant = await this.participantModel.findOneAndUpdate(
      { _id: new Types.ObjectId(participantId), meetingId: new Types.ObjectId(meetingId) },
      { role },
      { new: true },
    );
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }
}
