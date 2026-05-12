import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobInterviewsService } from './job-interviews.service';
import { InterviewTokenGuard } from './interview-token.guard';
import { ReqInterviewApplication } from './req-interview-application.decorator';
import type { JobApplicationDocument } from './schemas/job-application.schema';
import { InterviewMessageDto, ProctoringBatchDto } from './dto/interview-session.dto';

@ApiTags('job-interviews')
@Controller('public/interview')
export class PublicInterviewController {
  constructor(private readonly jobInterviews: JobInterviewsService) {}

  @Get('session')
  @UseGuards(InterviewTokenGuard)
  session(@ReqInterviewApplication() app: JobApplicationDocument) {
    return this.jobInterviews.getInterviewSession(app).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post('start')
  @UseGuards(InterviewTokenGuard)
  start(@ReqInterviewApplication() app: JobApplicationDocument) {
    return this.jobInterviews.startInterview(app).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post('message')
  @UseGuards(InterviewTokenGuard)
  message(@ReqInterviewApplication() app: JobApplicationDocument, @Body() dto: InterviewMessageDto) {
    return this.jobInterviews.postInterviewMessage(app, dto.content).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post('submit')
  @UseGuards(InterviewTokenGuard)
  submit(@ReqInterviewApplication() app: JobApplicationDocument) {
    return this.jobInterviews.submitInterview(app).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post('leave')
  @UseGuards(InterviewTokenGuard)
  leave(@ReqInterviewApplication() app: JobApplicationDocument) {
    return this.jobInterviews.leaveInterview(app).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }

  @Post('proctoring')
  @UseGuards(InterviewTokenGuard)
  proctoring(@ReqInterviewApplication() app: JobApplicationDocument, @Body() dto: ProctoringBatchDto) {
    return this.jobInterviews.addProctoringEvents(app, dto).then((data) => ({
      status: 'success' as const,
      data,
    }));
  }
}
