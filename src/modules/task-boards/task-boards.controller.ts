import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/auth-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { TaskBoardsService } from './task-boards.service';
import { CreateTaskBoardDto } from './dto/create-task-board.dto';
import { UpdateTaskBoardDto } from './dto/update-task-board.dto';
import { CreateTaskListDto } from './dto/create-task-list.dto';
import { UpdateTaskListDto } from './dto/update-task-list.dto';
import { ReorderTaskCardsDto, ReorderTaskListsDto } from './dto/reorder.dto';
import { CreateTaskCardDto } from './dto/create-task-card.dto';
import { UpdateTaskCardDto } from './dto/update-task-card.dto';
import { CreateTaskLabelDto } from './dto/create-task-label.dto';
import { UpdateTaskLabelDto } from './dto/update-task-label.dto';
import { CreateTaskCardCommentDto } from './dto/create-task-card-comment.dto';
import { CreateTaskChecklistDto } from './dto/create-task-checklist.dto';
import { CreateTaskChecklistItemDto } from './dto/create-task-checklist-item.dto';
import { UpdateTaskChecklistItemDto } from './dto/update-task-checklist-item.dto';

@ApiTags('boards')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('boards')
export class TaskBoardsController {
  constructor(private readonly taskBoards: TaskBoardsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.taskBoards.listBoardSummaries(user.id).then((data) => ({ status: 'success', data }));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskBoardDto) {
    return this.taskBoards.createBoard(user.id, dto).then((data) => ({ status: 'success', data }));
  }

  @Get(':boardId')
  get(@CurrentUser() user: AuthUser, @Param('boardId') boardId: string) {
    return this.taskBoards.getBoardFull(user.id, boardId).then((data) => ({ status: 'success', data }));
  }

  @Patch(':boardId')
  update(@CurrentUser() user: AuthUser, @Param('boardId') boardId: string, @Body() dto: UpdateTaskBoardDto) {
    return this.taskBoards.updateBoard(user.id, boardId, dto).then((data) => ({ status: 'success', data }));
  }

  @Delete(':boardId')
  remove(@CurrentUser() user: AuthUser, @Param('boardId') boardId: string) {
    return this.taskBoards.deleteBoard(user.id, boardId).then((data) => ({ status: 'success', data }));
  }

  @Post(':boardId/lists/reorder')
  reorderLists(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Body() dto: ReorderTaskListsDto,
  ) {
    return this.taskBoards.reorderLists(user.id, boardId, dto).then((data) => ({ status: 'success', data }));
  }

  @Post(':boardId/lists')
  createList(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Body() dto: CreateTaskListDto,
  ) {
    return this.taskBoards.createList(user.id, boardId, dto).then((data) => ({ status: 'success', data }));
  }

  @Patch(':boardId/lists/:listId')
  updateList(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('listId') listId: string,
    @Body() dto: UpdateTaskListDto,
  ) {
    return this.taskBoards.updateList(user.id, boardId, listId, dto).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Delete(':boardId/lists/:listId')
  deleteList(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('listId') listId: string,
  ) {
    return this.taskBoards.deleteList(user.id, boardId, listId).then((data) => ({ status: 'success', data }));
  }

  @Post(':boardId/cards/reorder')
  reorderCards(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Body() dto: ReorderTaskCardsDto,
  ) {
    return this.taskBoards.reorderCards(user.id, boardId, dto).then((data) => ({ status: 'success', data }));
  }

  @Post(':boardId/lists/:listId/cards')
  createCard(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('listId') listId: string,
    @Body() dto: CreateTaskCardDto,
  ) {
    return this.taskBoards.createCard(user.id, boardId, listId, dto).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Patch(':boardId/cards/:cardId')
  updateCard(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateTaskCardDto,
  ) {
    return this.taskBoards.updateCard(user.id, boardId, cardId, dto).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Delete(':boardId/cards/:cardId')
  deleteCard(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.taskBoards.deleteCard(user.id, boardId, cardId).then((data) => ({ status: 'success', data }));
  }

  @Post(':boardId/labels')
  createLabel(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Body() dto: CreateTaskLabelDto,
  ) {
    return this.taskBoards.createLabel(user.id, boardId, dto).then((data) => ({ status: 'success', data }));
  }

  @Patch(':boardId/labels/:labelId')
  updateLabel(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('labelId') labelId: string,
    @Body() dto: UpdateTaskLabelDto,
  ) {
    return this.taskBoards.updateLabel(user.id, boardId, labelId, dto).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Delete(':boardId/labels/:labelId')
  deleteLabel(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.taskBoards.deleteLabel(user.id, boardId, labelId).then((data) => ({ status: 'success', data }));
  }

  @Get(':boardId/cards/:cardId/comments')
  listComments(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.taskBoards.listComments(user.id, boardId, cardId).then((data) => ({ status: 'success', data }));
  }

  @Post(':boardId/cards/:cardId/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: CreateTaskCardCommentDto,
  ) {
    return this.taskBoards.addComment(user.id, boardId, cardId, dto).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Delete(':boardId/comments/:commentId')
  deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.taskBoards.deleteComment(user.id, boardId, commentId).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Post(':boardId/cards/:cardId/checklists')
  createChecklist(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: CreateTaskChecklistDto,
  ) {
    return this.taskBoards.createChecklist(user.id, boardId, cardId, dto).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Delete(':boardId/checklists/:checklistId')
  deleteChecklist(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('checklistId') checklistId: string,
  ) {
    return this.taskBoards.deleteChecklist(user.id, boardId, checklistId).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Post(':boardId/checklists/:checklistId/items')
  addChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('checklistId') checklistId: string,
    @Body() dto: CreateTaskChecklistItemDto,
  ) {
    return this.taskBoards.addChecklistItem(user.id, boardId, checklistId, dto).then((data) => ({
      status: 'success',
      data,
    }));
  }

  @Patch(':boardId/checklists/:checklistId/items/:itemId')
  updateChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('checklistId') checklistId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateTaskChecklistItemDto,
  ) {
    return this.taskBoards
      .updateChecklistItem(user.id, boardId, checklistId, itemId, dto)
      .then((data) => ({ status: 'success', data }));
  }

  @Delete(':boardId/checklists/:checklistId/items/:itemId')
  deleteChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Param('checklistId') checklistId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.taskBoards
      .deleteChecklistItem(user.id, boardId, checklistId, itemId)
      .then((data) => ({ status: 'success', data }));
  }
}
