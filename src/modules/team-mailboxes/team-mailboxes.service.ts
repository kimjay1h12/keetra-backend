import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { resolveTxt } from 'node:dns/promises';
import { TeamsService } from '../teams/teams.service';
import { TeamMailDomain, TeamMailDomainDocument } from './schemas/team-mail-domain.schema';
import { TeamMailbox, TeamMailboxDocument } from './schemas/team-mailbox.schema';
import { CreateTeamMailDomainDto } from './dto/create-team-mail-domain.dto';
import { CreateTeamMailboxDto } from './dto/create-team-mailbox.dto';
import { TeamMailProvisionService } from './team-mail-provision.service';

const BCRYPT_ROUNDS = 10;

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function randomPassword(): string {
  return randomBytes(14).toString('base64url').slice(0, 20);
}

function verificationToken(): string {
  return randomBytes(18).toString('hex');
}

export type TeamMailClientConfig = {
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  webmailUrl?: string;
};

@Injectable()
export class TeamMailboxesService {
  constructor(
    @InjectModel(TeamMailDomain.name)
    private readonly domainModel: Model<TeamMailDomainDocument>,
    @InjectModel(TeamMailbox.name)
    private readonly mailboxModel: Model<TeamMailboxDocument>,
    private readonly teamsService: TeamsService,
    private readonly config: ConfigService,
    private readonly provision: TeamMailProvisionService,
  ) {}

  getClientConfig(): TeamMailClientConfig {
    return {
      imapHost: this.config.get<string>('TEAM_MAIL_IMAP_HOST', 'mail.example.com'),
      imapPort: Number(this.config.get<string>('TEAM_MAIL_IMAP_PORT', '993')),
      imapTls: this.config.get<string>('TEAM_MAIL_IMAP_TLS', 'true') !== 'false',
      smtpHost: this.config.get<string>('TEAM_MAIL_SMTP_HOST', 'mail.example.com'),
      smtpPort: Number(this.config.get<string>('TEAM_MAIL_SMTP_PORT', '587')),
      smtpTls: this.config.get<string>('TEAM_MAIL_SMTP_TLS', 'true') !== 'false',
      webmailUrl: this.config.get<string>('TEAM_MAIL_WEBMAIL_URL')?.trim() || undefined,
    };
  }

  async getClientConfigForMember(teamId: string, userId: string): Promise<TeamMailClientConfig> {
    await this.teamsService.assertMembership(teamId, userId);
    return this.getClientConfig();
  }

  private defaultPlatformDomain(): string | undefined {
    const d = this.config.get<string>('TEAM_MAIL_DEFAULT_DOMAIN')?.trim().toLowerCase();
    return d || undefined;
  }

  private async domainHasVerificationTxt(fqdn: string, token: string): Promise<boolean> {
    const expected = `kmeet-mail-verify=${token}`;
    try {
      const rows = await resolveTxt(fqdn);
      for (const row of rows) {
        const joined = row.join('');
        if (joined === expected) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  async listDomains(teamId: string, userId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const rows = await this.domainModel.find({ teamId: new Types.ObjectId(teamId) }).lean();
    return rows.map((r) => ({
      _id: r._id.toString(),
      teamId: r.teamId.toString(),
      domain: r.domain,
      verificationStatus: r.verificationStatus,
      verificationToken:
        r.verificationStatus === 'pending' ? r.verificationToken : undefined,
      verificationHint:
        r.verificationStatus === 'pending'
          ? `Add a TXT record at ${r.domain} with value: kmeet-mail-verify=${r.verificationToken}`
          : undefined,
      isDefault: r.isDefault,
      createdAt: (r as { createdAt?: Date }).createdAt?.toISOString?.(),
      updatedAt: (r as { updatedAt?: Date }).updatedAt?.toISOString?.(),
    }));
  }

  async addDomain(teamId: string, userId: string, dto: CreateTeamMailDomainDto) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const domain = normalizeDomain(dto.domain);
    const platformDefault = this.defaultPlatformDomain();
    const autoVerify = Boolean(platformDefault && domain === platformDefault);

    const doc = await this.domainModel.create({
      teamId: new Types.ObjectId(teamId),
      domain,
      verificationStatus: autoVerify ? 'verified' : 'pending',
      verificationToken: autoVerify ? undefined : verificationToken(),
      isDefault: Boolean(dto.isDefault),
    });

    if (dto.isDefault) {
      await this.domainModel.updateMany(
        {
          teamId: new Types.ObjectId(teamId),
          _id: { $ne: doc._id },
        },
        { $set: { isDefault: false } },
      );
    }

    const list = await this.listDomains(teamId, userId);
    const created = list.find((x) => x._id === doc._id.toString());
    if (!created) {
      throw new NotFoundException('Domain was created but could not be reloaded');
    }
    return created;
  }

  async verifyDomain(teamId: string, userId: string, domainId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const row = await this.domainModel.findOne({
      _id: new Types.ObjectId(domainId),
      teamId: new Types.ObjectId(teamId),
    });
    if (!row) throw new NotFoundException('Domain not found');
    if (row.verificationStatus === 'verified') {
      return { verified: true as const, domain: row.domain };
    }
    if (!row.verificationToken) {
      throw new BadRequestException('Domain has no verification token');
    }
    const ok = await this.domainHasVerificationTxt(row.domain, row.verificationToken);
    if (!ok) {
      throw new BadRequestException(
        `TXT record not found at ${row.domain}. Expected: kmeet-mail-verify=${row.verificationToken}`,
      );
    }
    row.verificationStatus = 'verified';
    row.verificationToken = undefined;
    await row.save();
    return { verified: true as const, domain: row.domain };
  }

  async deleteDomain(teamId: string, userId: string, domainId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const count = await this.mailboxModel.countDocuments({
      teamId: new Types.ObjectId(teamId),
      domainId: new Types.ObjectId(domainId),
      status: 'active',
    });
    if (count > 0) {
      throw new BadRequestException('Disable or remove mailboxes on this domain first');
    }
    const res = await this.domainModel.deleteOne({
      _id: new Types.ObjectId(domainId),
      teamId: new Types.ObjectId(teamId),
    });
    if (res.deletedCount === 0) throw new NotFoundException('Domain not found');
    return { deleted: true as const };
  }

  async listMailboxes(teamId: string, userId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const boxes = await this.mailboxModel
      .find({ teamId: new Types.ObjectId(teamId) })
      .populate('domainId')
      .lean();
    return boxes.map((b) => {
      const dom = b.domainId as unknown as { domain?: string };
      const host = dom?.domain ?? '';
      const address = host ? `${b.localPart}@${host}` : b.localPart;
      return {
        _id: b._id.toString(),
        teamId: b.teamId.toString(),
        domainId: (b.domainId as Types.ObjectId).toString(),
        domain: host,
        localPart: b.localPart,
        address,
        displayName: b.displayName,
        quotaMb: b.quotaMb,
        status: b.status,
        kind: b.kind,
        forwardTo: b.forwardTo,
        createdAt: (b as { createdAt?: Date }).createdAt?.toISOString?.(),
        updatedAt: (b as { updatedAt?: Date }).updatedAt?.toISOString?.(),
      };
    });
  }

  async createMailbox(teamId: string, userId: string, dto: CreateTeamMailboxDto) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const localPart = dto.localPart.trim().toLowerCase();
    const domainRow = await this.domainModel.findOne({
      _id: new Types.ObjectId(dto.domainId),
      teamId: new Types.ObjectId(teamId),
    });
    if (!domainRow) throw new NotFoundException('Domain not found for this team');
    if (domainRow.verificationStatus !== 'verified') {
      throw new BadRequestException('Verify the domain before creating mailboxes');
    }

    const plainPassword = randomPassword();
    const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

    let mailbox: TeamMailboxDocument;
    try {
      mailbox = await this.mailboxModel.create({
        teamId: new Types.ObjectId(teamId),
        domainId: domainRow._id,
        localPart,
        kind: 'mailbox',
        displayName: dto.displayName?.trim(),
        passwordHash,
        quotaMb: dto.quotaMb ?? 512,
        status: 'active',
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 11000) {
        throw new ConflictException('That mailbox address already exists');
      }
      throw err;
    }

    const email = `${localPart}@${domainRow.domain}`;
    try {
      await this.provision.send({
        action: 'mailbox.create',
        email,
        password: plainPassword,
        displayName: dto.displayName?.trim(),
        quotaMb: mailbox.quotaMb,
      });
    } catch {
      await this.mailboxModel.deleteOne({ _id: mailbox._id });
      throw new BadRequestException(
        'Mail server provisioning failed. Check TEAM_MAIL_PROVISION_URL or bridge logs.',
      );
    }

    return {
      mailbox: {
        _id: mailbox._id.toString(),
        teamId,
        domainId: domainRow._id.toString(),
        domain: domainRow.domain,
        localPart,
        address: email,
        displayName: mailbox.displayName,
        quotaMb: mailbox.quotaMb,
        status: mailbox.status,
        kind: mailbox.kind,
      },
      initialPassword: plainPassword,
    };
  }

  async disableMailbox(teamId: string, userId: string, mailboxId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const box = await this.mailboxModel.findOne({
      _id: new Types.ObjectId(mailboxId),
      teamId: new Types.ObjectId(teamId),
    });
    if (!box) throw new NotFoundException('Mailbox not found');
    if (box.status === 'disabled') {
      return { disabled: true as const };
    }

    const domainRow = await this.domainModel.findById(box.domainId);
    const email = domainRow ? `${box.localPart}@${domainRow.domain}` : box.localPart;

    try {
      await this.provision.send({ action: 'mailbox.delete', email });
    } catch {
      throw new BadRequestException(
        'Mail server deprovision failed. Mailbox left active; fix the bridge and retry.',
      );
    }

    box.status = 'disabled';
    await box.save();
    return { disabled: true as const };
  }

  async resetMailboxPassword(teamId: string, userId: string, mailboxId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const box = await this.mailboxModel.findOne({
      _id: new Types.ObjectId(mailboxId),
      teamId: new Types.ObjectId(teamId),
      status: 'active',
    });
    if (!box) throw new NotFoundException('Active mailbox not found');
    const domainRow = await this.domainModel.findById(box.domainId);
    if (!domainRow) throw new NotFoundException('Domain missing');
    const email = `${box.localPart}@${domainRow.domain}`;
    const plainPassword = randomPassword();
    try {
      await this.provision.send({
        action: 'mailbox.password',
        email,
        password: plainPassword,
      });
    } catch {
      throw new BadRequestException(
        'Mail server bridge failed — password was not changed in KeeTra.',
      );
    }
    box.passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
    await box.save();

    return { address: email, newPassword: plainPassword };
  }
}
