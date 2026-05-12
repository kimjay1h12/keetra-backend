import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JobInterviewsService } from './job-interviews.service';
import type { JobApplicationDocument } from './schemas/job-application.schema';

export type RequestWithInterview = Request & {
  interviewApplication?: JobApplicationDocument;
};

@Injectable()
export class InterviewTokenGuard implements CanActivate {
  constructor(private readonly jobInterviews: JobInterviewsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithInterview>();
    const auth = req.headers['authorization'];
    const headerToken = req.headers['x-interview-token'];
    let token = '';
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
      token = auth.slice(7).trim();
    } else if (typeof headerToken === 'string') {
      token = headerToken.trim();
    }
    if (!token) {
      throw new UnauthorizedException('Interview token required (Authorization: Bearer or X-Interview-Token)');
    }
    const app = await this.jobInterviews.findApplicationByInterviewToken(token);
    if (!app) {
      throw new UnauthorizedException('Invalid interview token');
    }
    req.interviewApplication = app;
    return true;
  }
}
