import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JobApplicationDocument } from './schemas/job-application.schema';
import type { RequestWithInterview } from './interview-token.guard';

export const ReqInterviewApplication = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JobApplicationDocument => {
    const req = ctx.switchToHttp().getRequest<RequestWithInterview>();
    const app = req.interviewApplication;
    if (!app) {
      throw new Error('InterviewTokenGuard must run before ReqInterviewApplication');
    }
    return app;
  },
);
