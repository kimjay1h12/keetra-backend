import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { mkdirSync, renameSync, unlinkSync, createReadStream, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { TeamsService } from '../teams/teams.service';
import { Team, TeamDocument } from '../teams/schemas/team.schema';
import { JobPosting, JobPostingDocument } from './schemas/job-posting.schema';
import {
  JobApplication,
  JobApplicationDocument,
  InterviewTurn,
} from './schemas/job-application.schema';
import { ProctoringEvent, ProctoringEventDocument } from './schemas/proctoring-event.schema';
import type { ProctoringBatchDto } from './dto/interview-session.dto';

const CV_MAX_BYTES = 10 * 1024 * 1024;

/** Proctoring aggregate thresholds — exceeding ends the interview server-side. */
const PROC_TERMINATE = {
  multipleFaces: 3,
  tabHidden: 8,
  multiFacePlusTabHidden: { faces: 2, tabs: 5 },
} as const;

const ALLOWED_CV_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function hashInterviewToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

function safeBasename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return base || 'cv';
}

function extForMime(mime: string): string {
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return '.docx';
  return '';
}

function slugifyTitle(title: string): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'job';
}

function normalizeLinkedIn(raw: string): string {
  let s = raw.trim();
  if (!s) throw new BadRequestException('LinkedIn profile URL is required');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new BadRequestException('Invalid LinkedIn URL');
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) {
    throw new BadRequestException('LinkedIn URL must be on linkedin.com');
  }
  const path = `${url.pathname}`.toLowerCase();
  if (!path.includes('/in/') && !path.includes('/pub/')) {
    throw new BadRequestException('Use a LinkedIn profile URL containing /in/ or /pub/');
  }
  url.hash = '';
  return url.toString();
}

function normalizeSkills(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const t = typeof s === 'string' ? s.trim() : '';
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.length > 80 ? t.slice(0, 80) : t);
  }
  return out.slice(0, 40);
}

type InterviewTimerMode = 'off' | 'per_question' | 'session';

type ResolvedInterviewConfig = {
  maxQuestions: number;
  tokenTtlHours: number;
  timerMode: InterviewTimerMode;
  timerSecondsPerQuestion: number;
  timerSecondsTotal: number;
};

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function resolveInterviewConfig(job: { interviewConfig?: Record<string, unknown> } | null): ResolvedInterviewConfig {
  const c = job?.interviewConfig ?? {};
  const tm = c.timerMode;
  const timerMode: InterviewTimerMode =
    tm === 'per_question' || tm === 'session' ? tm : 'off';
  return {
    maxQuestions: clampInt(c.maxQuestions, 1, 50, 8),
    tokenTtlHours: clampInt(c.tokenTtlHours, 1, 168, 72),
    timerMode,
    timerSecondsPerQuestion: clampInt(c.timerSecondsPerQuestion, 30, 3600, 180),
    timerSecondsTotal: clampInt(c.timerSecondsTotal, 120, 7200, 1800),
  };
}

@Injectable()
export class JobInterviewsService {
  private readonly logger = new Logger(JobInterviewsService.name);

  constructor(
    @InjectModel(JobPosting.name) private readonly jobModel: Model<JobPostingDocument>,
    @InjectModel(JobApplication.name) private readonly applicationModel: Model<JobApplicationDocument>,
    @InjectModel(ProctoringEvent.name) private readonly proctoringModel: Model<ProctoringEventDocument>,
    @InjectModel(Team.name) private readonly teamModel: Model<TeamDocument>,
    private readonly teamsService: TeamsService,
    private readonly aiService: AiService,
    private readonly config: ConfigService,
  ) {}

  private uploadRoot(): string {
    return this.config.get<string>('UPLOAD_ROOT', join(process.cwd(), 'uploads'));
  }

  private mergeInterviewConfigFromDto(
    patch:
      | {
          maxQuestions?: number;
          tokenTtlHours?: number;
          timerMode?: InterviewTimerMode;
          timerSecondsPerQuestion?: number;
          timerSecondsTotal?: number;
        }
      | undefined,
    previous: Record<string, unknown> | undefined,
  ): ResolvedInterviewConfig {
    const prev = resolveInterviewConfig({ interviewConfig: previous });
    if (!patch) return prev;
    return resolveInterviewConfig({
      interviewConfig: {
        maxQuestions: patch.maxQuestions ?? prev.maxQuestions,
        tokenTtlHours: patch.tokenTtlHours ?? prev.tokenTtlHours,
        timerMode: patch.timerMode ?? prev.timerMode,
        timerSecondsPerQuestion: patch.timerSecondsPerQuestion ?? prev.timerSecondsPerQuestion,
        timerSecondsTotal: patch.timerSecondsTotal ?? prev.timerSecondsTotal,
      },
    });
  }

  async listJobsForTeam(teamId: string, userId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const rows = await this.jobModel
      .find({ teamId: new Types.ObjectId(teamId) })
      .sort({ updatedAt: -1 })
      .lean();
    return rows.map((r) => ({
      _id: r._id.toString(),
      teamId: r.teamId.toString(),
      title: r.title,
      publicSlug: r.publicSlug,
      requirementsText: r.requirementsText,
      skills: r.skills ?? [],
      status: r.status,
      interviewConfig: r.interviewConfig,
      createdAt: (r as { createdAt?: Date }).createdAt?.toISOString?.(),
      updatedAt: (r as { updatedAt?: Date }).updatedAt?.toISOString?.(),
    }));
  }

  async createJob(
    teamId: string,
    userId: string,
    dto: {
      title: string;
      publicSlug?: string;
      requirementsText: string;
      status?: 'draft' | 'open' | 'closed';
      interviewConfig?: {
        maxQuestions?: number;
        tokenTtlHours?: number;
        timerMode?: InterviewTimerMode;
        timerSecondsPerQuestion?: number;
        timerSecondsTotal?: number;
      };
      skills?: string[];
    },
  ) {
    await this.teamsService.assertTeamManager(teamId, userId);
    let slug = (dto.publicSlug || '').trim().toLowerCase();
    if (!slug) {
      slug = `${slugifyTitle(dto.title)}-${randomBytes(3).toString('hex')}`;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug)) {
      throw new BadRequestException(
        'publicSlug must be 3–80 chars, lowercase letters, digits, hyphens; start/end with letter or digit',
      );
    }
    const exists = await this.jobModel.findOne({ publicSlug: slug }).lean();
    if (exists) throw new BadRequestException('That job URL slug is already taken');
    const doc = await this.jobModel.create({
      teamId: new Types.ObjectId(teamId),
      createdBy: new Types.ObjectId(userId),
      title: dto.title.trim(),
      publicSlug: slug,
      requirementsText: dto.requirementsText.trim(),
      skills: normalizeSkills(dto.skills),
      status: dto.status ?? 'draft',
      interviewConfig: this.mergeInterviewConfigFromDto(dto.interviewConfig, undefined),
    });
    return this.getJobEmployer(teamId, userId, doc._id.toString());
  }

  async getJobEmployer(teamId: string, userId: string, jobId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const row = await this.jobModel
      .findOne({ _id: new Types.ObjectId(jobId), teamId: new Types.ObjectId(teamId) })
      .lean();
    if (!row) throw new NotFoundException('Job not found');
    return {
      _id: row._id.toString(),
      teamId: row.teamId.toString(),
      title: row.title,
      publicSlug: row.publicSlug,
      requirementsText: row.requirementsText,
      skills: row.skills ?? [],
      status: row.status,
      interviewConfig: row.interviewConfig,
      createdAt: (row as { createdAt?: Date }).createdAt?.toISOString?.(),
      updatedAt: (row as { updatedAt?: Date }).updatedAt?.toISOString?.(),
    };
  }

  async updateJob(
    teamId: string,
    userId: string,
    jobId: string,
    dto: {
      title?: string;
      requirementsText?: string;
      status?: 'draft' | 'open' | 'closed';
      interviewConfig?: {
        maxQuestions?: number;
        tokenTtlHours?: number;
        timerMode?: InterviewTimerMode;
        timerSecondsPerQuestion?: number;
        timerSecondsTotal?: number;
      };
      skills?: string[];
    },
  ) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const row = await this.jobModel.findOne({
      _id: new Types.ObjectId(jobId),
      teamId: new Types.ObjectId(teamId),
    });
    if (!row) throw new NotFoundException('Job not found');
    if (dto.title !== undefined) row.title = dto.title.trim();
    if (dto.requirementsText !== undefined) row.requirementsText = dto.requirementsText.trim();
    if (dto.skills !== undefined) row.skills = normalizeSkills(dto.skills);
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.interviewConfig) {
      row.interviewConfig = this.mergeInterviewConfigFromDto(
        dto.interviewConfig,
        row.interviewConfig as unknown as Record<string, unknown>,
      );
    }
    await row.save();
    return this.getJobEmployer(teamId, userId, jobId);
  }

  async deleteJob(teamId: string, userId: string, jobId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const job = await this.jobModel.findOne({
      _id: new Types.ObjectId(jobId),
      teamId: new Types.ObjectId(teamId),
    });
    if (!job) throw new NotFoundException('Job not found');
    const apps = await this.applicationModel.find({ jobId: job._id }).select('_id').lean();
    for (const a of apps) {
      await this.proctoringModel.deleteMany({ applicationId: a._id });
      const dir = join(this.uploadRoot(), 'job-applications', a._id.toString());
      try {
        const fs = await import('fs/promises');
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    await this.applicationModel.deleteMany({ jobId: job._id });
    await job.deleteOne();
    return { deleted: true as const };
  }

  async listApplications(teamId: string, userId: string, jobId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const job = await this.jobModel.findOne({
      _id: new Types.ObjectId(jobId),
      teamId: new Types.ObjectId(teamId),
    });
    if (!job) throw new NotFoundException('Job not found');
    const rows = await this.applicationModel.find({ jobId: job._id }).sort({ rankScore: -1 }).lean();
    const out: {
      _id: string;
      jobId: string;
      candidateName: string;
      candidateEmail: string;
      linkedinProfileUrl: string;
      status: string;
      rankScore?: number;
      scores?: Record<string, unknown>;
      aiSummary?: string;
      proctoringFlags: Record<string, number>;
      createdAt?: string;
      updatedAt?: string;
    }[] = [];
    for (const r of rows) {
      const procCounts = await this.proctoringModel.aggregate([
        { $match: { applicationId: r._id } },
        { $group: { _id: '$type', c: { $sum: 1 } } },
      ]);
      const proctoringFlags: Record<string, number> = {};
      for (const p of procCounts) {
        proctoringFlags[p._id] = p.c;
      }
      out.push({
        _id: r._id.toString(),
        jobId: r.jobId.toString(),
        candidateName: r.candidateName,
        candidateEmail: r.candidateEmail,
        linkedinProfileUrl: r.linkedinProfileUrl,
        status: r.status,
        rankScore: r.rankScore,
        scores: r.scores,
        aiSummary: r.aiSummary,
        proctoringFlags,
        createdAt: (r as { createdAt?: Date }).createdAt?.toISOString?.(),
        updatedAt: (r as { updatedAt?: Date }).updatedAt?.toISOString?.(),
      });
    }
    return out;
  }

  async getCvFileForEmployer(teamId: string, userId: string, jobId: string, applicationId: string) {
    await this.teamsService.assertTeamManager(teamId, userId);
    const job = await this.jobModel.findOne({
      _id: new Types.ObjectId(jobId),
      teamId: new Types.ObjectId(teamId),
    });
    if (!job) throw new NotFoundException('Job not found');
    const app = await this.applicationModel.findOne({
      _id: new Types.ObjectId(applicationId),
      jobId: job._id,
    });
    if (!app) throw new NotFoundException('Application not found');
    const dir = join(this.uploadRoot(), 'job-applications', app._id.toString());
    const full = join(dir, app.cvStoredFilename);
    if (!existsSync(full)) throw new NotFoundException('CV file missing');
    return {
      stream: createReadStream(full),
      mimeType: app.cvMimeType,
      filename: app.cvOriginalFilename,
    };
  }

  async getPublicJobBySlug(publicSlug: string) {
    const slug = publicSlug.trim().toLowerCase();
    const job = await this.jobModel.findOne({ publicSlug: slug, status: 'open' }).lean();
    if (!job) throw new NotFoundException('Job not found or not accepting applications');
    const team = await this.teamModel.findById(job.teamId).select('name').lean();
    return {
      title: job.title,
      publicSlug: job.publicSlug,
      teamName: team?.name ?? 'Team',
      consentVersion: 1,
      skills: job.skills ?? [],
    };
  }

  async apply(
    publicSlug: string,
    fields: { name: string; email: string; linkedinProfileUrl: string },
    file: Express.Multer.File,
  ) {
    const slug = publicSlug.trim().toLowerCase();
    const job = await this.jobModel.findOne({ publicSlug: slug, status: 'open' });
    if (!job) throw new NotFoundException('Job not found or not accepting applications');
    if (!file) throw new BadRequestException('CV file is required');
    if (file.size > CV_MAX_BYTES) throw new BadRequestException('CV exceeds maximum size');
    if (!ALLOWED_CV_MIMES.has(file.mimetype)) {
      throw new BadRequestException('CV must be PDF or DOCX');
    }
    const linkedin = normalizeLinkedIn(fields.linkedinProfileUrl);
    const plainToken = randomBytes(32).toString('base64url');
    const tokenHash = hashInterviewToken(plainToken);
    const ttlH = job.interviewConfig?.tokenTtlHours ?? 72;
    const tokenExpiresAt = new Date(Date.now() + ttlH * 3600 * 1000);

    const storedName = `cv${extForMime(file.mimetype)}`;
    const appId = new Types.ObjectId();
    const destDir = join(this.uploadRoot(), 'job-applications', appId.toString());
    const destPath = join(destDir, storedName);

    try {
      mkdirSync(destDir, { recursive: true });
      renameSync(file.path, destPath);
    } catch (e) {
      try {
        unlinkSync(file.path);
      } catch {
        /* */
      }
      try {
        rmSync(destDir, { recursive: true, force: true });
      } catch {
        /* */
      }
      this.logger.error('CV save failed (filesystem)', e);
      throw new BadRequestException('Could not store CV file');
    }

    try {
      await this.applicationModel.create({
        _id: appId,
        jobId: job._id,
        candidateName: fields.name.trim(),
        candidateEmail: fields.email.trim().toLowerCase(),
        linkedinProfileUrl: linkedin,
        cvStoredFilename: storedName,
        cvOriginalFilename: safeBasename(file.originalname),
        cvMimeType: file.mimetype,
        cvSizeBytes: file.size,
        interviewTokenHash: tokenHash,
        tokenExpiresAt,
        status: 'invited',
        messages: [],
      });
    } catch (e) {
      try {
        rmSync(destDir, { recursive: true, force: true });
      } catch {
        /* */
      }
      this.logger.error('CV save failed (database)', e);
      throw new BadRequestException('Could not create application');
    }

    return {
      interviewToken: plainToken,
      expiresAt: tokenExpiresAt.toISOString(),
      applicationId: appId.toString(),
    };
  }

  assertApplicationToken(app: JobApplicationDocument) {
    if (app.tokenExpiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Interview link has expired');
    }
    if (app.status === 'submitted') {
      throw new ForbiddenException('Interview already submitted');
    }
    if (app.status === 'expired') {
      throw new ForbiddenException('Interview session is no longer valid');
    }
    if (app.status === 'terminated') {
      throw new ForbiddenException('Interview ended due to integrity checks');
    }
    if (app.status === 'withdrawn') {
      throw new ForbiddenException('Interview ended when you left; the hiring team will follow up with you');
    }
  }

  private assertInterviewSessionReadable(app: JobApplicationDocument) {
    if (app.tokenExpiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Interview link has expired');
    }
    if (app.status === 'expired') {
      throw new ForbiddenException('Interview session is no longer valid');
    }
  }

  async getInterviewSession(app: JobApplicationDocument) {
    this.assertInterviewSessionReadable(app);
    const live = await this.applicationModel.findById(app._id);
    if (!live) throw new NotFoundException('Application not found');
    const job = await this.jobModel.findById(live.jobId).lean();
    if (!job) throw new NotFoundException('Job not found');
    await this.applyInterviewTimerIfNeeded(live, job);
    const after = await this.applicationModel.findById(app._id);
    if (!after) throw new NotFoundException('Application not found');
    const cfg = resolveInterviewConfig(job);
    const deadline = this.computeReplyDeadlineAt(after, cfg);
    const userAnswerCount = after.messages.filter((m) => m.role === 'user').length;
    return {
      jobTitle: job.title,
      requirementsExcerpt: job.requirementsText.slice(0, 4000),
      status: after.status,
      terminationReason: after.terminationReason,
      messages: after.messages.map((m) => ({
        role: m.role,
        content: m.content,
        at: m.at instanceof Date ? m.at.toISOString() : m.at,
      })),
      maxQuestions: cfg.maxQuestions,
      userAnswerCount,
      disclaimer:
        'A working camera is required for this interview. Timers are enforced on the server; when time expires the interview may auto-submit or end. Proctoring signals are heuristics, not proof of misconduct.',
      serverTime: new Date().toISOString(),
      timerMode: cfg.timerMode,
      replyDeadlineAt: deadline ? deadline.toISOString() : null,
      timerSecondsPerQuestion: cfg.timerMode === 'per_question' ? cfg.timerSecondsPerQuestion : null,
      timerSecondsTotal: cfg.timerMode === 'session' ? cfg.timerSecondsTotal : null,
      rankScore: after.status === 'submitted' ? after.rankScore : undefined,
      aiSummary: after.status === 'submitted' ? after.aiSummary : undefined,
      scores: after.status === 'submitted' ? (after.scores as Record<string, unknown> | undefined) : undefined,
      exitNotice:
        after.status === 'withdrawn'
          ? 'Thanks — your responses have been saved. The hiring team will review your application and get back to you. You will not see an automated interview score here.'
          : undefined,
    };
  }

  async leaveInterview(app: JobApplicationDocument) {
    if (app.tokenExpiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Interview link has expired');
    }
    if (app.status === 'submitted' || app.status === 'withdrawn') {
      return { ok: true as const, alreadyFinal: true as const };
    }
    if (app.status === 'expired' || app.status === 'terminated') {
      return { ok: true as const, alreadyFinal: true as const };
    }
    if (app.status !== 'invited' && app.status !== 'in_progress') {
      return { ok: true as const, alreadyFinal: true as const };
    }
    app.status = 'withdrawn';
    app.messages.push({
      role: 'system',
      content:
        'You left the interview before submitting for scoring. Your conversation has been saved for the hiring team.',
      at: new Date(),
    });
    await app.save();
    return { ok: true as const, alreadyFinal: false as const };
  }

  async startInterview(app: JobApplicationDocument) {
    this.assertApplicationToken(app);
    if (app.status === 'submitted' || app.status === 'expired' || app.status === 'terminated' || app.status === 'withdrawn') {
      throw new ForbiddenException('Cannot start interview');
    }
    if (app.messages.length > 0) {
      return this.getInterviewSession(app);
    }
    const job = await this.jobModel.findById(app.jobId).lean();
    if (!job) throw new NotFoundException('Job not found');
    const opening = await this.aiService.jobInterviewOpening({
      jobTitle: job.title,
      requirementsText: job.requirementsText,
      candidateName: app.candidateName,
    });
    const startAt = new Date();
    app.interviewClockStartAt = startAt;
    const turn: InterviewTurn = {
      role: 'assistant',
      content: opening,
      at: startAt,
    };
    app.messages.push(turn);
    app.status = 'in_progress';
    await app.save();
    return this.getInterviewSession(app);
  }

  async postInterviewMessage(app: JobApplicationDocument, content: string) {
    let live = await this.applicationModel.findById(app._id);
    if (!live) throw new NotFoundException('Application not found');
    this.assertApplicationToken(live);
    if (live.status === 'invited') {
      throw new BadRequestException('Call POST /public/interview/start first');
    }
    if (live.status !== 'in_progress') {
      throw new ForbiddenException('Interview is not active');
    }
    const job = await this.jobModel.findById(live.jobId).lean();
    if (!job) throw new NotFoundException('Job not found');
    await this.applyInterviewTimerIfNeeded(live, job);
    live = (await this.applicationModel.findById(app._id))!;
    if (live.status !== 'in_progress') {
      throw new ForbiddenException('Interview is no longer active (it may have timed out).');
    }
    this.assertUserReplyWithinDeadline(live, job);
    const cfg = resolveInterviewConfig(job);
    const maxQ = cfg.maxQuestions;
    const userTurnsBefore = live.messages.filter((m) => m.role === 'user').length;
    if (userTurnsBefore >= maxQ) {
      throw new BadRequestException('Maximum interview questions answered; submit your interview.');
    }
    const userMsg: InterviewTurn = {
      role: 'user',
      content: content.trim(),
      at: new Date(),
    };
    if (!userMsg.content) throw new BadRequestException('Message cannot be empty');
    live.messages.push(userMsg);
    await live.save();

    const transcript = live.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    const userTurnsAfter = live.messages.filter((m) => m.role === 'user').length;
    const next = await this.aiService.jobInterviewNextTurn({
      jobTitle: job.title,
      requirementsText: job.requirementsText,
      transcript,
      maxQuestions: maxQ,
      userTurnsSoFar: userTurnsAfter,
    });
    const asst: InterviewTurn = {
      role: 'assistant',
      content: next.assistantMessage,
      at: new Date(),
    };
    live.messages.push(asst);
    await live.save();
    await this.applyInterviewTimerIfNeeded(live, job);
    return {
      ...(await this.getInterviewSession(live)),
      interviewComplete: next.interviewComplete,
    };
  }

  async submitInterview(app: JobApplicationDocument) {
    const live = await this.applicationModel.findById(app._id);
    if (!live) throw new NotFoundException('Application not found');
    if (live.status === 'submitted') {
      return {
        alreadySubmitted: true as const,
        rankScore: live.rankScore,
        aiSummary: live.aiSummary,
        scores: live.scores,
      };
    }
    this.assertApplicationToken(live);
    if (live.status !== 'in_progress' && live.status !== 'invited') {
      if (live.status === 'terminated') {
        throw new ForbiddenException('Interview was ended and cannot be submitted');
      }
      if (live.status === 'withdrawn') {
        throw new ForbiddenException('Interview ended when you left; the team will follow up with you');
      }
      throw new ForbiddenException('Cannot submit');
    }
    const job = await this.jobModel.findById(live.jobId).lean();
    if (!job) throw new NotFoundException('Job not found');
    await this.applyInterviewTimerIfNeeded(live, job);
    const after = await this.applicationModel.findById(app._id);
    if (!after) throw new NotFoundException('Application not found');
    if (after.status === 'submitted') {
      return {
        alreadySubmitted: true as const,
        rankScore: after.rankScore,
        aiSummary: after.aiSummary,
        scores: after.scores,
      };
    }
    if (after.status !== 'in_progress' && after.status !== 'invited') {
      if (after.status === 'terminated') {
        throw new ForbiddenException('Interview was ended and cannot be submitted');
      }
      if (after.status === 'withdrawn') {
        throw new ForbiddenException('Interview ended when you left; the team will follow up with you');
      }
      throw new ForbiddenException('Cannot submit');
    }
    if (after.messages.filter((m) => m.role === 'user').length < 1) {
      throw new BadRequestException('Answer at least one question before submitting');
    }
    const result = await this.performGradeAndMarkSubmitted(after, job);
    return {
      rankScore: result.rankScore,
      aiSummary: result.aiSummary,
      scores: result.scores,
    };
  }

  private computeReplyDeadlineAt(app: JobApplicationDocument, cfg: ResolvedInterviewConfig): Date | null {
    if (cfg.timerMode === 'off' || app.status !== 'in_progress') return null;
    if (cfg.timerMode === 'session') {
      const t0 = app.interviewClockStartAt?.getTime();
      if (!t0) return null;
      return new Date(t0 + cfg.timerSecondsTotal * 1000);
    }
    for (let i = app.messages.length - 1; i >= 0; i--) {
      const m = app.messages[i];
      if (m.role === 'assistant') {
        const at = m.at instanceof Date ? m.at.getTime() : new Date(m.at as string).getTime();
        return new Date(at + cfg.timerSecondsPerQuestion * 1000);
      }
      if (m.role === 'user') return null;
    }
    return null;
  }

  private assertUserReplyWithinDeadline(
    app: JobApplicationDocument,
    job: { interviewConfig?: Record<string, unknown> } | null,
  ) {
    const cfg = resolveInterviewConfig(job);
    if (cfg.timerMode === 'off') return;
    const now = Date.now();
    if (cfg.timerMode === 'session') {
      const t0 = app.interviewClockStartAt?.getTime();
      if (t0 && now > t0 + cfg.timerSecondsTotal * 1000) {
        throw new BadRequestException('Interview time limit has expired');
      }
    } else if (cfg.timerMode === 'per_question') {
      let lastAsst: InterviewTurn | undefined;
      for (let i = app.messages.length - 1; i >= 0; i--) {
        const m = app.messages[i];
        if (m.role === 'assistant') {
          lastAsst = m;
          break;
        }
      }
      if (lastAsst) {
        const at =
          lastAsst.at instanceof Date ? lastAsst.at.getTime() : new Date(lastAsst.at as string).getTime();
        if (now > at + cfg.timerSecondsPerQuestion * 1000) {
          throw new BadRequestException('Time limit for this question has expired');
        }
      }
    }
  }

  private async applyInterviewTimerIfNeeded(
    app: JobApplicationDocument,
    job: { interviewConfig?: Record<string, unknown> } | null,
  ): Promise<void> {
    const cfg = resolveInterviewConfig(job);
    if (cfg.timerMode === 'off' || app.status !== 'in_progress') return;
    const now = Date.now();
    let fire = false;
    if (cfg.timerMode === 'session') {
      const t0 = app.interviewClockStartAt?.getTime();
      if (t0 && now >= t0 + cfg.timerSecondsTotal * 1000) {
        fire = true;
      }
    } else if (cfg.timerMode === 'per_question') {
      let lastAsst: InterviewTurn | undefined;
      for (let i = app.messages.length - 1; i >= 0; i--) {
        const m = app.messages[i];
        if (m.role === 'assistant') {
          lastAsst = m;
          break;
        }
      }
      if (lastAsst) {
        const at =
          lastAsst.at instanceof Date ? lastAsst.at.getTime() : new Date(lastAsst.at as string).getTime();
        if (now >= at + cfg.timerSecondsPerQuestion * 1000) {
          fire = true;
        }
      }
    }
    if (!fire) return;
    await this.finalizeInterviewDueToTimer(app, job);
  }

  private async finalizeInterviewDueToTimer(
    app: JobApplicationDocument,
    job: { interviewConfig?: Record<string, unknown> } | null,
  ): Promise<void> {
    const userTurns = app.messages.filter((m) => m.role === 'user').length;
    if (userTurns >= 1) {
      app.messages.push({
        role: 'system',
        content: 'Interview auto-submitted when the configured time limit was reached.',
        at: new Date(),
      });
      await app.save();
      await this.performGradeAndMarkSubmitted(app, job);
      return;
    }
    app.status = 'terminated';
    app.terminationReason =
      'The interview time limit expired before any answer was recorded.';
    app.messages.push({
      role: 'system',
      content: `Interview ended: ${app.terminationReason}`,
      at: new Date(),
    });
    await app.save();
  }

  private async performGradeAndMarkSubmitted(
    app: JobApplicationDocument,
    job: { interviewConfig?: Record<string, unknown> } | null,
  ): Promise<{ rankScore: number; aiSummary?: string; scores?: Record<string, unknown> }> {
    if (app.status === 'submitted') {
      return {
        rankScore: app.rankScore ?? 0,
        aiSummary: app.aiSummary,
        scores: app.scores as Record<string, unknown> | undefined,
      };
    }
    const jobLean = (job ?? (await this.jobModel.findById(app.jobId).lean())) as {
      title: string;
      requirementsText: string;
    } | null;
    if (!jobLean) throw new NotFoundException('Job not found');
    const transcript = app.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    const procCounts = await this.proctoringModel.aggregate([
      { $match: { applicationId: app._id } },
      { $group: { _id: '$type', c: { $sum: 1 } } },
    ]);
    const flags: Record<string, number> = {};
    for (const p of procCounts) flags[p._id] = p.c;
    let grade: {
      criteria: { id: string; score: number; note: string }[];
      strengths: string[];
      gaps: string[];
      overallSummary: string;
    };
    try {
      grade = await this.aiService.jobInterviewGrade({
        jobTitle: jobLean.title,
        requirementsText: jobLean.requirementsText,
        transcript,
        proctoringFlags: flags,
      });
    } catch (e) {
      this.logger.error('Grading failed', e);
      throw new ServiceUnavailableException('AI grading is temporarily unavailable');
    }
    const avg =
      grade.criteria.length > 0
        ? grade.criteria.reduce((s, c) => s + Math.min(5, Math.max(1, c.score)), 0) / grade.criteria.length
        : 3;
    let penalty = 0;
    penalty += (flags.tab_hidden ?? 0) * 0.5;
    penalty += (flags.no_face ?? 0) * 0.3;
    penalty += (flags.multiple_faces ?? 0) * 2;
    penalty += (flags.gaze_away ?? 0) * 0.2;
    penalty += (flags.camera_denied ?? 0) * 1;
    const rankScore = Math.max(0, Math.min(100, Math.round(avg * 20 - penalty)));

    app.aiSummary = grade.overallSummary;
    app.scores = {
      criteria: grade.criteria,
      strengths: grade.strengths,
      gaps: grade.gaps,
    } as Record<string, unknown>;
    app.rankScore = rankScore;
    app.proctoringSummary = { counts: flags };
    app.status = 'submitted';
    await app.save();
    return {
      rankScore,
      aiSummary: app.aiSummary,
      scores: app.scores as Record<string, unknown>,
    };
  }

  async addProctoringEvents(app: JobApplicationDocument, dto: ProctoringBatchDto) {
    if (app.tokenExpiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Interview link has expired');
    }
    if (app.status === 'terminated') {
      return { inserted: 0, sessionTerminated: false as const };
    }
    if (app.status === 'withdrawn') {
      return { inserted: 0, sessionTerminated: false as const };
    }
    this.assertApplicationToken(app);
    if (app.status !== 'in_progress') {
      return { inserted: 0, sessionTerminated: false as const };
    }
    if (!dto.events?.length) return { inserted: 0, sessionTerminated: false as const };
    const docs = dto.events.slice(0, 200).map((e) => ({
      applicationId: app._id,
      ts: e.ts ? new Date(e.ts) : new Date(),
      type: e.type,
      severity: e.severity ?? 1,
      meta: e.meta,
    }));
    await this.proctoringModel.insertMany(docs);

    const procCounts = await this.proctoringModel.aggregate<{ _id: string; c: number }>([
      { $match: { applicationId: app._id } },
      { $group: { _id: '$type', c: { $sum: 1 } } },
    ]);
    const flags: Record<string, number> = {};
    for (const p of procCounts) flags[p._id] = p.c;

    const mf = flags.multiple_faces ?? 0;
    const th = flags.tab_hidden ?? 0;
    let terminationReason: string | null = null;
    if (mf >= PROC_TERMINATE.multipleFaces) {
      terminationReason =
        'The session was ended after repeated multiple-face detections (more than one person may be visible).';
    } else if (th >= PROC_TERMINATE.tabHidden) {
      terminationReason =
        'The session was ended after repeated tab or window switches during the interview.';
    } else if (
      mf >= PROC_TERMINATE.multiFacePlusTabHidden.faces &&
      th >= PROC_TERMINATE.multiFacePlusTabHidden.tabs
    ) {
      terminationReason =
        'The session was ended due to combined integrity signals (faces and tab activity).';
    }

    if (terminationReason) {
      const fresh = await this.applicationModel.findById(app._id);
      if (fresh && fresh.status === 'in_progress') {
        fresh.status = 'terminated';
        fresh.terminationReason = terminationReason;
        fresh.messages.push({
          role: 'system',
          content: `Interview ended: ${terminationReason}`,
          at: new Date(),
        });
        await fresh.save();
      }
      return {
        inserted: docs.length,
        sessionTerminated: true as const,
        terminationReason,
      };
    }

    const liveAfter = await this.applicationModel.findById(app._id);
    if (liveAfter && liveAfter.status === 'in_progress') {
      const jobLean = await this.jobModel.findById(liveAfter.jobId).lean();
      await this.applyInterviewTimerIfNeeded(liveAfter, jobLean);
    }

    return { inserted: docs.length, sessionTerminated: false as const };
  }

  async findApplicationByInterviewToken(plainToken: string): Promise<JobApplicationDocument | null> {
    const h = hashInterviewToken(plainToken.trim());
    return this.applicationModel.findOne({ interviewTokenHash: h });
  }
}
