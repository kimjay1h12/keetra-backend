import { mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { JobInterviewsService } from './job-interviews.service';
import { CreateJobPostingDto, UpdateJobPostingDto } from './dto/job-posting.dto';
import { ApplyJobBodyDto } from './dto/apply-job.dto';

const CV_MAX_BYTES = 10 * 1024 * 1024;

function safeBasename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return base || 'file';
}

@ApiTags('job-interviews')
@Controller('teams/:teamId/jobs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TeamJobsController {
  constructor(private readonly jobInterviews: JobInterviewsService) {}

  @Get()
  list(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser) {
    return this.jobInterviews.listJobsForTeam(teamId, user.id).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post()
  create(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJobPostingDto,
  ) {
    return this.jobInterviews
      .createJob(teamId, user.id, {
        title: dto.title,
        publicSlug: dto.publicSlug,
        requirementsText: dto.requirementsText,
        status: dto.status,
        interviewConfig: dto.interviewConfig,
        skills: dto.skills,
      })
      .then((data) => ({ status: 'success' as const, data }));
  }

  @Get(':jobId/applications/:applicationId/cv')
  async downloadCv(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Param('applicationId') applicationId: string,
  ): Promise<StreamableFile> {
    const { stream, mimeType, filename } = await this.jobInterviews.getCvFileForEmployer(
      teamId,
      user.id,
      jobId,
      applicationId,
    );
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  }

  @Get(':jobId/applications')
  applications(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.jobInterviews.listApplications(teamId, user.id, jobId).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Get(':jobId')
  getOne(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.jobInterviews.getJobEmployer(teamId, user.id, jobId).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Patch(':jobId')
  patch(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateJobPostingDto,
  ) {
    return this.jobInterviews
      .updateJob(teamId, user.id, jobId, {
        title: dto.title,
        requirementsText: dto.requirementsText,
        status: dto.status,
        interviewConfig: dto.interviewConfig,
        skills: dto.skills,
      })
      .then((data) => ({ status: 'success' as const, data }));
  }

  @Delete(':jobId')
  remove(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.jobInterviews.deleteJob(teamId, user.id, jobId).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }
}

@ApiTags('job-interviews')
@Controller('public/jobs')
export class PublicJobsController {
  constructor(private readonly jobInterviews: JobInterviewsService) {}

  @Get(':publicSlug')
  getJob(@Param('publicSlug') publicSlug: string) {
    return this.jobInterviews.getPublicJobBySlug(publicSlug).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post(':publicSlug/apply')
  @UseInterceptors(
    FileInterceptor('cv', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'job-applications', 'temp');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}-${safeBasename(file.originalname)}`);
        },
      }),
      limits: { fileSize: CV_MAX_BYTES },
    }),
  )
  apply(
    @Param('publicSlug') publicSlug: string,
    @Body() body: ApplyJobBodyDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('CV file is required');
    }
    return this.jobInterviews
      .apply(
        publicSlug,
        {
          name: body.name,
          email: body.email,
          linkedinProfileUrl: body.linkedinProfileUrl,
        },
        file,
      )
      .then((data) => ({ status: 'success' as const, data }));
  }
}
