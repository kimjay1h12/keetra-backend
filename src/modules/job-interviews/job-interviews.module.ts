import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamsModule } from '../teams/teams.module';
import { AiModule } from '../ai/ai.module';
import { Team, TeamSchema } from '../teams/schemas/team.schema';
import { JobPosting, JobPostingSchema } from './schemas/job-posting.schema';
import { JobApplication, JobApplicationSchema } from './schemas/job-application.schema';
import { ProctoringEvent, ProctoringEventSchema } from './schemas/proctoring-event.schema';
import { JobInterviewsService } from './job-interviews.service';
import { InterviewTokenGuard } from './interview-token.guard';
import { TeamJobsController, PublicJobsController } from './job-interviews.controller';
import { PublicInterviewController } from './public-interview.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobPosting.name, schema: JobPostingSchema },
      { name: JobApplication.name, schema: JobApplicationSchema },
      { name: ProctoringEvent.name, schema: ProctoringEventSchema },
      { name: Team.name, schema: TeamSchema },
    ]),
    TeamsModule,
    AiModule,
  ],
  controllers: [TeamJobsController, PublicJobsController, PublicInterviewController],
  providers: [JobInterviewsService, InterviewTokenGuard],
  exports: [JobInterviewsService],
})
export class JobInterviewsModule {}
