import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MailService, type MailAttachmentPayload } from '../mail/mail.service';
import { TeamsService } from '../teams/teams.service';
import { BulkEmailTemplate, BulkEmailTemplateDocument } from './schemas/bulk-email-template.schema';
import { BulkEmailSend, BulkEmailSendDocument } from './schemas/bulk-email-send.schema';
import { BulkEmailSchedule, BulkEmailScheduleDocument } from './schemas/bulk-email-schedule.schema';
import type {
  BulkEmailAttachmentDto,
  CreateBulkEmailScheduleDto,
  CreateBulkEmailTemplateDto,
  SendBulkEmailDto,
  UpdateBulkEmailTemplateDto,
} from './dto/bulk-email.dto';
import { BULK_EMAIL_PRESETS, presetByKey } from './bulk-email.presets';

function plainFromHtml(html: string): string {
  const t = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return t.replace(/\s+/g, ' ').trim().slice(0, 80_000) || ' ';
}

function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlFromPlainText(plain: string): string {
  const esc = escapeHtmlForEmail(plain);
  return `<!DOCTYPE html><html><body><pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:15px;color:#374151;margin:0;">${esc}</pre></body></html>`;
}

const BULK_EMAIL_MAX_ATTACHMENT_COUNT = 15;
const BULK_EMAIL_MAX_ATTACHMENT_BYTES_EACH = 5 * 1024 * 1024;
const BULK_EMAIL_MAX_ATTACHMENT_BYTES_TOTAL = 12 * 1024 * 1024;

function addMs(d: Date, ms: number): Date {
  return new Date(d.getTime() + ms);
}

@Injectable()
export class BulkEmailService {
  private readonly logger = new Logger(BulkEmailService.name);

  constructor(
    @InjectModel(BulkEmailTemplate.name)
    private readonly templateModel: Model<BulkEmailTemplateDocument>,
    @InjectModel(BulkEmailSend.name)
    private readonly sendModel: Model<BulkEmailSendDocument>,
    @InjectModel(BulkEmailSchedule.name)
    private readonly scheduleModel: Model<BulkEmailScheduleDocument>,
    private readonly mailService: MailService,
    private readonly teamsService: TeamsService,
  ) {}

  listPresets() {
    return BULK_EMAIL_PRESETS.map(({ key, name, description, subject }) => ({
      key,
      name,
      description,
      subject,
    }));
  }

  getPreset(key: string) {
    const p = presetByKey(key);
    if (!p) throw new NotFoundException('Preset not found');
    return {
      key: p.key,
      name: p.name,
      description: p.description,
      subject: p.subject,
      htmlBody: p.htmlBody,
      textBody: p.textBody,
    };
  }

  private resolveCampaignBodies(htmlBody?: string, textBody?: string): { html: string; text: string } {
    const htmlIn = htmlBody?.trim() ?? '';
    const textIn = textBody?.trim() ?? '';
    if (!htmlIn && !textIn) {
      throw new BadRequestException('Add a message body (HTML and/or plain text).');
    }
    if (htmlIn) {
      return { html: htmlIn, text: textIn || plainFromHtml(htmlIn) };
    }
    return { html: htmlFromPlainText(textIn), text: textIn };
  }

  private parseAttachments(rows?: BulkEmailAttachmentDto[]): MailAttachmentPayload[] {
    if (!rows?.length) return [];
    if (rows.length > BULK_EMAIL_MAX_ATTACHMENT_COUNT) {
      throw new BadRequestException(`Too many attachments (max ${BULK_EMAIL_MAX_ATTACHMENT_COUNT})`);
    }
    let total = 0;
    const out: MailAttachmentPayload[] = [];
    for (const a of rows) {
      const name = a.filename.trim();
      if (!name || /[/\\]/.test(name) || name.includes('..')) {
        throw new BadRequestException(`Invalid attachment filename: ${a.filename}`);
      }
      const raw = a.contentBase64.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
      const buf = Buffer.from(raw, 'base64');
      if (!buf.length) {
        throw new BadRequestException(`Empty or invalid attachment "${name}"`);
      }
      if (buf.length > BULK_EMAIL_MAX_ATTACHMENT_BYTES_EACH) {
        throw new BadRequestException(`Attachment "${name}" exceeds 5MB`);
      }
      total += buf.length;
      if (total > BULK_EMAIL_MAX_ATTACHMENT_BYTES_TOTAL) {
        throw new BadRequestException('Combined attachments exceed 12MB');
      }
      out.push({
        filename: name,
        content: buf,
        contentType: a.contentType?.trim() || undefined,
      });
    }
    return out;
  }

  async listTemplates(userId: string) {
    const rows = await this.templateModel
      .find({ ownerUserId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();
    return rows.map((r) => ({
      _id: r._id.toString(),
      name: r.name,
      subject: r.subject,
      updatedAt: (r as { updatedAt?: Date }).updatedAt?.toISOString(),
    }));
  }

  async getTemplate(userId: string, id: string) {
    const row = await this.templateModel.findOne({
      _id: new Types.ObjectId(id),
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!row) throw new NotFoundException('Template not found');
    return {
      _id: row._id.toString(),
      name: row.name,
      subject: row.subject,
      htmlBody: row.htmlBody,
      textBody: row.textBody ?? plainFromHtml(row.htmlBody),
    };
  }

  async createTemplate(userId: string, dto: CreateBulkEmailTemplateDto) {
    const row = await this.templateModel.create({
      ownerUserId: new Types.ObjectId(userId),
      name: dto.name.trim(),
      subject: dto.subject.trim(),
      htmlBody: dto.htmlBody,
      textBody: dto.textBody?.trim() || plainFromHtml(dto.htmlBody),
    });
    return {
      _id: row._id.toString(),
      name: row.name,
      subject: row.subject,
    };
  }

  async updateTemplate(userId: string, id: string, dto: UpdateBulkEmailTemplateDto) {
    const row = await this.templateModel.findOne({
      _id: new Types.ObjectId(id),
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!row) throw new NotFoundException('Template not found');
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.subject !== undefined) row.subject = dto.subject.trim();
    if (dto.htmlBody !== undefined) {
      row.htmlBody = dto.htmlBody;
      if (dto.textBody !== undefined) row.textBody = dto.textBody.trim();
      else row.textBody = plainFromHtml(dto.htmlBody);
    } else if (dto.textBody !== undefined) {
      row.textBody = dto.textBody.trim();
    }
    await row.save();
    return { _id: row._id.toString(), name: row.name, subject: row.subject };
  }

  async deleteTemplate(userId: string, id: string) {
    const r = await this.templateModel.deleteOne({
      _id: new Types.ObjectId(id),
      ownerUserId: new Types.ObjectId(userId),
    });
    if (r.deletedCount === 0) throw new NotFoundException('Template not found');
    return { deleted: true };
  }

  async listHistory(userId: string, limit = 40) {
    const rows = await this.sendModel
      .find({ ownerUserId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();
    return rows.map((r) => ({
      _id: r._id.toString(),
      subject: r.subject,
      recipientCount: r.recipientCount,
      status: r.status,
      presetKey: r.presetKey,
      customTemplateId: r.customTemplateId?.toString(),
      teamId: r.teamId?.toString(),
      createdAt: (r as { createdAt?: Date }).createdAt?.toISOString(),
    }));
  }

  async getSend(userId: string, id: string) {
    const row = await this.sendModel.findOne({
      _id: new Types.ObjectId(id),
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!row) throw new NotFoundException('Send not found');
    return {
      _id: row._id.toString(),
      subject: row.subject,
      htmlBody: row.htmlBody,
      textBody: row.textBody ?? plainFromHtml(row.htmlBody),
      to: row.to,
      teamId: row.teamId?.toString(),
      presetKey: row.presetKey,
      customTemplateId: row.customTemplateId?.toString(),
      status: row.status,
      createdAt: (row as { createdAt?: Date }).createdAt?.toISOString(),
    };
  }

  private async assertTeamIfProvided(userId: string, teamId?: string) {
    if (!teamId?.trim()) return;
    await this.teamsService.assertTeamRole(teamId.trim(), userId, ['owner', 'admin', 'member']);
  }

  async send(userId: string, dto: SendBulkEmailDto) {
    const to = [...new Set(dto.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!to.length) throw new BadRequestException('Add at least one recipient');
    if (to.length > 200) throw new BadRequestException('Too many recipients (max 200)');

    await this.assertTeamIfProvided(userId, dto.teamId);

    if (dto.customTemplateId) {
      const t = await this.templateModel.findOne({
        _id: new Types.ObjectId(dto.customTemplateId),
        ownerUserId: new Types.ObjectId(userId),
      });
      if (!t) throw new BadRequestException('Custom template not found');
    }
    if (dto.presetKey && !presetByKey(dto.presetKey)) {
      throw new BadRequestException('Unknown preset key');
    }

    const { html, text } = this.resolveCampaignBodies(dto.htmlBody, dto.textBody);
    const attachments = this.parseAttachments(dto.attachments);
    try {
      await this.mailService.sendToEach(to, {
        subject: dto.subject.trim(),
        html,
        text,
        attachments: attachments.length ? attachments : undefined,
      });
    } catch (e) {
      this.logger.error('Bulk send mail error', e);
    }

    const mailEnabled = this.mailService.isEnabled();
    const status = mailEnabled ? 'completed' : 'skipped';

    const doc = await this.sendModel.create({
      ownerUserId: new Types.ObjectId(userId),
      subject: dto.subject.trim(),
      htmlBody: html,
      textBody: text,
      to,
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : undefined,
      presetKey: dto.presetKey?.trim(),
      customTemplateId: dto.customTemplateId
        ? new Types.ObjectId(dto.customTemplateId)
        : undefined,
      status,
      recipientCount: to.length,
    });

    return {
      sendId: doc._id.toString(),
      recipientCount: to.length,
      status,
      mailConfigured: Boolean(mailEnabled),
    };
  }

  async resend(userId: string, sendId: string) {
    const prev = await this.sendModel.findOne({
      _id: new Types.ObjectId(sendId),
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!prev) throw new NotFoundException('Send not found');
    const text = prev.textBody ?? plainFromHtml(prev.htmlBody);
    await this.mailService.sendToEach(prev.to, {
      subject: prev.subject,
      html: prev.htmlBody,
      text,
    });
    const mailEnabled = this.mailService.isEnabled();
    const doc = await this.sendModel.create({
      ownerUserId: new Types.ObjectId(userId),
      subject: prev.subject,
      htmlBody: prev.htmlBody,
      textBody: text,
      to: prev.to,
      teamId: prev.teamId,
      presetKey: prev.presetKey,
      customTemplateId: prev.customTemplateId,
      status: mailEnabled ? 'completed' : 'skipped',
      recipientCount: prev.to.length,
    });
    return {
      sendId: doc._id.toString(),
      recipientCount: prev.to.length,
      status: doc.status,
      mailConfigured: Boolean(mailEnabled),
    };
  }

  async listSchedules(userId: string) {
    const rows = await this.scheduleModel
      .find({ ownerUserId: new Types.ObjectId(userId), active: true })
      .sort({ nextRunAt: 1 })
      .lean();
    return rows.map((r) => ({
      _id: r._id.toString(),
      subject: r.subject,
      frequency: r.frequency,
      recipientCount: r.recipients.length,
      nextRunAt: r.nextRunAt?.toISOString(),
      lastRunAt: r.lastRunAt?.toISOString(),
    }));
  }

  async createSchedule(userId: string, dto: CreateBulkEmailScheduleDto) {
    const { html, text } = this.resolveCampaignBodies(dto.htmlBody, dto.textBody);
    const recipients = [...new Set(dto.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) throw new BadRequestException('Add at least one recipient');
    if (recipients.length > 200) throw new BadRequestException('Too many recipients');
    const days = dto.frequency === 'weekly' ? 7 : 30;
    const periodMs = days * 24 * 60 * 60 * 1000;
    let nextRunAt = dto.startAt
      ? new Date(dto.startAt)
      : addMs(new Date(), periodMs);
    if (Number.isNaN(nextRunAt.getTime())) throw new BadRequestException('Invalid startAt');
    if (nextRunAt.getTime() < Date.now()) nextRunAt = new Date();
    const row = await this.scheduleModel.create({
      ownerUserId: new Types.ObjectId(userId),
      subject: dto.subject.trim(),
      htmlBody: html,
      textBody: text,
      recipients,
      frequency: dto.frequency,
      nextRunAt,
      active: true,
    });
    return { _id: row._id.toString(), nextRunAt: row.nextRunAt.toISOString() };
  }

  async cancelSchedule(userId: string, id: string) {
    const r = await this.scheduleModel.updateOne(
      { _id: new Types.ObjectId(id), ownerUserId: new Types.ObjectId(userId) },
      { $set: { active: false } },
    );
    if (r.matchedCount === 0) throw new NotFoundException('Schedule not found');
    return { cancelled: true };
  }

  async processDueSchedules(): Promise<number> {
    const now = new Date();
    const due = await this.scheduleModel.find({ active: true, nextRunAt: { $lte: now } }).limit(25);
    let n = 0;
    for (const job of due) {
      try {
        const text = job.textBody ?? plainFromHtml(job.htmlBody);
        await this.mailService.sendToEach(job.recipients, {
          subject: job.subject,
          html: job.htmlBody,
          text,
        });
        const days = job.frequency === 'weekly' ? 7 : 30;
        job.lastRunAt = now;
        job.nextRunAt = addMs(now, days * 24 * 60 * 60 * 1000);
        await job.save();
        const mailEnabled = this.mailService.isEnabled();
        await this.sendModel.create({
          ownerUserId: job.ownerUserId,
          subject: job.subject,
          htmlBody: job.htmlBody,
          textBody: text,
          to: job.recipients,
          status: mailEnabled ? 'completed' : 'skipped',
          recipientCount: job.recipients.length,
        });
        n += 1;
      } catch (e) {
        this.logger.error(`Schedule ${job._id} failed`, e);
      }
    }
    return n;
  }
}
