import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { TaskBoard, TaskBoardSchema } from './schemas/task-board.schema';
import { TaskList, TaskListSchema } from './schemas/task-list.schema';
import { TaskCard, TaskCardSchema } from './schemas/task-card.schema';
import { TaskLabel, TaskLabelSchema } from './schemas/task-label.schema';
import { TaskCardComment, TaskCardCommentSchema } from './schemas/task-card-comment.schema';
import { TaskChecklist, TaskChecklistSchema } from './schemas/task-checklist.schema';
import { TaskBoardsService } from './task-boards.service';
import { TaskBoardsController } from './task-boards.controller';

@Module({
  imports: [
    TeamsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: TaskBoard.name, schema: TaskBoardSchema },
      { name: TaskList.name, schema: TaskListSchema },
      { name: TaskCard.name, schema: TaskCardSchema },
      { name: TaskLabel.name, schema: TaskLabelSchema },
      { name: TaskCardComment.name, schema: TaskCardCommentSchema },
      { name: TaskChecklist.name, schema: TaskChecklistSchema },
    ]),
  ],
  controllers: [TaskBoardsController],
  providers: [TaskBoardsService],
  exports: [TaskBoardsService],
})
export class TaskBoardsModule {}
