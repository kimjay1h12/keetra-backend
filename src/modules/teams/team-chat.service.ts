import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { SendTeamChatDto } from './dto/send-team-chat.dto';
import {
  TeamChatAttachment,
  TeamChatAttachmentDocument,
} from './schemas/team-chat-attachment.schema';
import { TeamChatMessage, TeamChatMessageDocument } from './schemas/team-chat-message.schema';
import { TeamsService } from './teams.service';

const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|text\/plain|application\/zip|application\/x-zip-compressed)/;

export type TeamChatAttachmentRow = {
  attachmentId: string;
  url: string;
  kind: 'image' | 'file';
  name: string;
  mimeType: string;
  size: number;
};

export type TeamChatMessageRow = {
  _id: string;
  teamId: string;
  senderId: string;
  content: string;
  mentionUserIds: string[];
  mentions: Array<{ userId: string; displayName: string | null }>;
  attachments: TeamChatAttachmentRow[];
  createdAt: string;
  updatedAt: string;
  senderEmail?: string;
  senderDisplayName?: string | null;
};

@Injectable()
export class TeamChatService {
  private readonly logger = new Logger(TeamChatService.name);

  constructor(
    @InjectModel(TeamChatMessage.name)
    private readonly messageModel: Model<TeamChatMessageDocument>,
    @InjectModel(TeamChatAttachment.name)
    private readonly attachmentModel: Model<TeamChatAttachmentDocument>,
    private readonly teamsService: TeamsService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  private uploadRoot(): string {
    return this.configService.get<string>('UPLOAD_ROOT', join(process.cwd(), 'uploads'));
  }

  private attachmentApiPath(teamId: string, attachmentId: string): string {
    return `/teams/${teamId}/chat/files/${attachmentId}`;
  }

  async registerAttachment(
    teamId: string,
    senderId: string,
    file: Express.Multer.File,
  ): Promise<{
    attachmentId: string;
    kind: 'image' | 'file';
    name: string;
    mimeType: string;
    size: number;
  }> {
    await this.teamsService.assertMembership(teamId, senderId);
    if (!file?.path) {
      throw new BadRequestException('Invalid upload');
    }
    if (!ALLOWED_MIME.test(file.mimetype)) {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw new BadRequestException('File type not allowed');
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw new BadRequestException('File too large (max 12 MB)');
    }

    const storedFilename = basename(file.path);
    const kind: 'image' | 'file' = file.mimetype.startsWith('image/') ? 'image' : 'file';

    const doc = await this.attachmentModel.create({
      teamId: new Types.ObjectId(teamId),
      uploadedBy: new Types.ObjectId(senderId),
      storedFilename,
      originalName: file.originalname?.slice(0, 240) || storedFilename,
      mimeType: file.mimetype,
      size: file.size,
    });

    return {
      attachmentId: doc._id.toString(),
      kind,
      name: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.size,
    };
  }

  async getAttachmentFile(
    teamId: string,
    attachmentId: string,
    userId: string,
  ): Promise<{ stream: ReturnType<typeof createReadStream>; mimeType: string; filename: string }> {
    await this.teamsService.assertMembership(teamId, userId);
    if (!Types.ObjectId.isValid(attachmentId)) {
      throw new NotFoundException('Attachment not found');
    }
    const doc = await this.attachmentModel.findById(attachmentId).exec();
    if (!doc || doc.teamId.toString() !== teamId) {
      throw new NotFoundException('Attachment not found');
    }
    const fullPath = join(this.uploadRoot(), 'team-chat', teamId, doc.storedFilename);
    if (!existsSync(fullPath)) {
      this.logger.warn(`Missing file on disk: ${fullPath}`);
      throw new NotFoundException('Attachment not found');
    }
    return {
      stream: createReadStream(fullPath),
      mimeType: doc.mimeType,
      filename: doc.originalName,
    };
  }

  async listMessages(
    teamId: string,
    userId: string,
    opts: { before?: string; limit?: number },
  ): Promise<{ messages: TeamChatMessageRow[]; hasMore: boolean }> {
    await this.teamsService.assertMembership(teamId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

    const filter: Record<string, unknown> = { teamId: new Types.ObjectId(teamId) };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      const anchor = await this.messageModel.findById(opts.before).select('createdAt').lean();
      const created = anchor && 'createdAt' in anchor ? anchor.createdAt : undefined;
      if (created instanceof Date) {
        filter['createdAt'] = { $lt: created };
      }
    }

    const batch = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const chronological = [...batch].reverse();
    const enriched = await this.enrichRows(teamId, chronological);
    return {
      messages: enriched,
      hasMore: batch.length === limit,
    };
  }

  async createMessage(teamId: string, senderId: string, dto: SendTeamChatDto): Promise<TeamChatMessageRow> {
    await this.teamsService.assertMembership(teamId, senderId);
    const text = (dto.content ?? '').trim();
    const mentionIds = dto.mentionUserIds?.length ? [...new Set(dto.mentionUserIds)] : [];
    const attachmentIds = dto.attachmentIds?.length ? [...new Set(dto.attachmentIds)] : [];

    if (!text && !attachmentIds.length) {
      throw new BadRequestException('Message must include text or at least one attachment');
    }

    if (mentionIds.length) {
      await this.teamsService.assertUserIdsAreTeamMembers(teamId, mentionIds);
    }

    const attachmentsPayload: Array<{
      attachmentId: Types.ObjectId;
      kind: 'image' | 'file';
      name: string;
      mimeType: string;
      size: number;
    }> = [];

    if (attachmentIds.length) {
      const docs = await this.attachmentModel
        .find({
          _id: { $in: attachmentIds.map((id) => new Types.ObjectId(id)) },
          teamId: new Types.ObjectId(teamId),
          uploadedBy: new Types.ObjectId(senderId),
        })
        .exec();

      if (docs.length !== attachmentIds.length) {
        throw new BadRequestException('Invalid or unauthorized attachment(s)');
      }

      for (const a of docs) {
        const kind: 'image' | 'file' = a.mimeType.startsWith('image/') ? 'image' : 'file';
        attachmentsPayload.push({
          attachmentId: a._id,
          kind,
          name: a.originalName,
          mimeType: a.mimeType,
          size: a.size,
        });
      }
    }

    const doc = await this.messageModel.create({
      teamId: new Types.ObjectId(teamId),
      senderId: new Types.ObjectId(senderId),
      content: text,
      mentionUserIds: mentionIds.map((id) => new Types.ObjectId(id)),
      attachments: attachmentsPayload,
    });

    const [row] = await this.enrichRows(teamId, [doc.toObject()]);
    return row;
  }

  private async enrichRows(teamId: string, docs: unknown[]): Promise<TeamChatMessageRow[]> {
    type LeanDoc = {
      _id: Types.ObjectId;
      teamId: Types.ObjectId;
      senderId: Types.ObjectId;
      content?: string;
      mentionUserIds?: Types.ObjectId[];
      attachments?: Array<{
        attachmentId: Types.ObjectId;
        kind: 'image' | 'file';
        name: string;
        mimeType: string;
        size: number;
      }>;
      createdAt?: Date;
      updatedAt?: Date;
    };
    const rows = docs.map((x) => x as LeanDoc);

    const senderIds = [...new Set(rows.map((d) => d.senderId.toString()))];
    const mentionIdSet = new Set<string>();
    for (const d of rows) {
      for (const id of d.mentionUserIds ?? []) {
        mentionIdSet.add(id.toString());
      }
    }
    const allUserIds = [...new Set([...senderIds, ...mentionIdSet])];
    const users = await Promise.all(allUserIds.map((id) => this.usersService.findById(id)));
    const byId = new Map(users.filter(Boolean).map((u) => [u!._id.toString(), u!]));

    return rows.map((d) => {
      const u = byId.get(d.senderId.toString());
      const mentionUserIds = (d.mentionUserIds ?? []).map((id) => id.toString());
      const mentions = mentionUserIds.map((uid) => {
        const mu = byId.get(uid);
        return {
          userId: uid,
          displayName: mu?.displayName ?? null,
        };
      });

      const rawAtt = d.attachments ?? [];
      const attachments: TeamChatAttachmentRow[] = rawAtt.map((a) => ({
        attachmentId: a.attachmentId.toString(),
        url: this.attachmentApiPath(teamId, a.attachmentId.toString()),
        kind: a.kind,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
      }));

      const createdAt = d.createdAt ?? new Date();
      const updatedAt = d.updatedAt ?? new Date();

      return {
        _id: d._id.toString(),
        teamId: d.teamId.toString(),
        senderId: d.senderId.toString(),
        content: typeof d.content === 'string' ? d.content : '',
        mentionUserIds,
        mentions,
        attachments,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : new Date().toISOString(),
        updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : new Date().toISOString(),
        senderEmail: u?.email,
        senderDisplayName: u?.displayName ?? null,
      };
    });
  }
}
