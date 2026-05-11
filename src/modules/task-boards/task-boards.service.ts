import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { TeamsService } from '../teams/teams.service';
import { TaskBoard, TaskBoardDocument } from './schemas/task-board.schema';
import { TaskList, TaskListDocument } from './schemas/task-list.schema';
import { TaskCard, TaskCardDocument } from './schemas/task-card.schema';
import { TaskLabel, TaskLabelDocument } from './schemas/task-label.schema';
import { TaskCardComment, TaskCardCommentDocument } from './schemas/task-card-comment.schema';
import { TaskChecklist, TaskChecklistDocument } from './schemas/task-checklist.schema';
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

function oid(id: string) {
  return new Types.ObjectId(id);
}

@Injectable()
export class TaskBoardsService {
  constructor(
    @InjectModel(TaskBoard.name) private readonly boardModel: Model<TaskBoardDocument>,
    @InjectModel(TaskList.name) private readonly listModel: Model<TaskListDocument>,
    @InjectModel(TaskCard.name) private readonly cardModel: Model<TaskCardDocument>,
    @InjectModel(TaskLabel.name) private readonly labelModel: Model<TaskLabelDocument>,
    @InjectModel(TaskCardComment.name) private readonly commentModel: Model<TaskCardCommentDocument>,
    @InjectModel(TaskChecklist.name) private readonly checklistModel: Model<TaskChecklistDocument>,
    private readonly teamsService: TeamsService,
    private readonly usersService: UsersService,
  ) {}

  private async assertBoardAccess(boardId: string, userId: string): Promise<TaskBoardDocument> {
    const board = await this.boardModel.findById(boardId);
    if (!board) throw new NotFoundException('Board not found');
    if (board.teamId) {
      await this.teamsService.assertMembership(board.teamId.toString(), userId);
    } else if (board.ownerId.toString() !== userId) {
      throw new ForbiddenException('Not allowed on this board');
    }
    return board;
  }

  private async normalizeAssignees(
    board: TaskBoardDocument,
    assigneeIds: string[],
    actorId: string,
  ): Promise<Types.ObjectId[]> {
    const uniq = [...new Set(assigneeIds.filter(Boolean))];
    if (!uniq.length) return [];
    if (!board.teamId) {
      throw new BadRequestException('Assignees are only supported on team boards');
    }
    const teamId = board.teamId.toString();
    const members = await this.teamsService.listMembers(teamId, actorId);
    const allowed = new Set(members.map((m) => m.userId));
    for (const id of uniq) {
      if (!allowed.has(id)) {
        throw new BadRequestException(
          'All assignees must be members of the team linked to this board',
        );
      }
    }
    return uniq.map((x) => oid(x));
  }

  async listBoardSummaries(userId: string) {
    const teamIds = await this.teamsService.listTeamIdsForUser(userId);
    const teamOid = teamIds.map((t) => oid(t));
    const rows = await this.boardModel
      .find({
        archived: false,
        $or: [{ ownerId: oid(userId) }, ...(teamOid.length ? [{ teamId: { $in: teamOid } }] : [])],
      })
      .sort({ updatedAt: -1 })
      .lean();
    return rows.map((b) => ({
      _id: b._id.toString(),
      title: b.title,
      description: b.description,
      ownerId: b.ownerId.toString(),
      teamId: b.teamId?.toString(),
      background: b.background,
      archived: b.archived,
      updatedAt: (b as { updatedAt?: Date }).updatedAt?.toISOString?.(),
      createdAt: (b as { createdAt?: Date }).createdAt?.toISOString?.(),
    }));
  }

  async createBoard(userId: string, dto: CreateTaskBoardDto) {
    if (dto.teamId) {
      await this.teamsService.assertMembership(dto.teamId, userId);
    }
    const board = await this.boardModel.create({
      title: dto.title.trim(),
      description: dto.description?.trim(),
      ownerId: oid(userId),
      teamId: dto.teamId ? oid(dto.teamId) : undefined,
      background: dto.background?.trim() || '#0079bf',
    });
    const defaults = ['To do', 'Doing', 'Done'];
    for (let i = 0; i < defaults.length; i++) {
      await this.listModel.create({
        boardId: board._id,
        title: defaults[i],
        position: i,
      });
    }
    return this.getBoardFull(userId, board._id.toString());
  }

  async getBoardFull(userId: string, boardId: string) {
    const board = await this.assertBoardAccess(boardId, userId);
    const [lists, labels, cards, checklists] = await Promise.all([
      this.listModel.find({ boardId: board._id }).sort({ position: 1 }).lean(),
      this.labelModel.find({ boardId: board._id }).lean(),
      this.cardModel.find({ boardId: board._id }).sort({ position: 1 }).lean(),
      this.checklistModel.find({ boardId: board._id }).lean(),
    ]);
    const checklistByCard = new Map<string, typeof checklists>();
    for (const c of checklists) {
      const k = c.cardId.toString();
      if (!checklistByCard.has(k)) checklistByCard.set(k, []);
      checklistByCard.get(k)!.push(c);
    }
    const labelMap = new Map(labels.map((l) => [l._id.toString(), l]));
    const cardsByList = new Map<string, typeof cards>();
    for (const c of cards) {
      const lid = c.listId.toString();
      if (!cardsByList.has(lid)) cardsByList.set(lid, []);
      cardsByList.get(lid)!.push(c);
    }
    const assigneeIdSet = new Set<string>();
    for (const c of cards) {
      for (const aid of c.assigneeIds ?? []) {
        assigneeIdSet.add(aid.toString());
      }
    }
    const assigneeRows = await this.usersService.findPublicRowsByIds([...assigneeIdSet]);
    const assigneeMap = new Map(assigneeRows.map((u) => [u._id, u]));
    const serializeCard = (c: (typeof cards)[0]) => ({
      _id: c._id.toString(),
      boardId: c.boardId.toString(),
      listId: c.listId.toString(),
      title: c.title,
      description: c.description,
      position: c.position,
      dueDate: c.dueDate?.toISOString?.(),
      coverColor: c.coverColor,
      labelIds: (c.labelIds ?? []).map((x) => x.toString()),
      labels: (c.labelIds ?? [])
        .map((id) => labelMap.get(id.toString()))
        .filter(Boolean)
        .map((l) => ({
          _id: l!._id.toString(),
          title: l!.title,
          color: l!.color,
        })),
      assigneeIds: (c.assigneeIds ?? []).map((x) => x.toString()),
      assignees: (c.assigneeIds ?? []).map((x) => {
        const id = x.toString();
        const u = assigneeMap.get(id);
        return {
          userId: id,
          displayName: u?.displayName ?? null,
          email: u?.email ?? null,
        };
      }),
      checklists: (checklistByCard.get(c._id.toString()) ?? []).map((cl) => ({
        _id: cl._id.toString(),
        cardId: cl.cardId.toString(),
        title: cl.title,
        items: (cl.items ?? []).map((it) => ({
          _id: it._id.toString(),
          title: it.title,
          done: it.done,
          order: it.order,
        })),
      })),
      createdAt: (c as { createdAt?: Date }).createdAt?.toISOString?.(),
      updatedAt: (c as { updatedAt?: Date }).updatedAt?.toISOString?.(),
    });
    return {
      board: {
        _id: board._id.toString(),
        title: board.title,
        description: board.description,
        ownerId: board.ownerId.toString(),
        teamId: board.teamId?.toString(),
        background: board.background,
        archived: board.archived,
        createdAt: (board as unknown as { createdAt?: Date }).createdAt?.toISOString?.(),
        updatedAt: (board as unknown as { updatedAt?: Date }).updatedAt?.toISOString?.(),
      },
      lists: lists.map((l) => ({
        _id: l._id.toString(),
        boardId: l.boardId.toString(),
        title: l.title,
        position: l.position,
        cards: (cardsByList.get(l._id.toString()) ?? []).map(serializeCard),
      })),
      labels: labels.map((l) => ({
        _id: l._id.toString(),
        boardId: l.boardId.toString(),
        title: l.title,
        color: l.color,
      })),
    };
  }

  async updateBoard(userId: string, boardId: string, dto: UpdateTaskBoardDto) {
    const board = await this.assertBoardAccess(boardId, userId);
    if (dto.title !== undefined) board.title = dto.title.trim();
    if (dto.description !== undefined) board.description = dto.description.trim();
    if (dto.background !== undefined) board.background = dto.background.trim();
    if (dto.archived !== undefined) board.archived = dto.archived;
    await board.save();
    return this.getBoardFull(userId, boardId);
  }

  async deleteBoard(userId: string, boardId: string) {
    await this.assertBoardAccess(boardId, userId);
    const boid = oid(boardId);
    await this.commentModel.deleteMany({ boardId: boid });
    await this.checklistModel.deleteMany({ boardId: boid });
    await this.cardModel.deleteMany({ boardId: boid });
    await this.labelModel.deleteMany({ boardId: boid });
    await this.listModel.deleteMany({ boardId: boid });
    await this.boardModel.deleteOne({ _id: boid });
    return { deleted: true as const };
  }

  async createList(userId: string, boardId: string, dto: CreateTaskListDto) {
    await this.assertBoardAccess(boardId, userId);
    const max = await this.listModel
      .findOne({ boardId: oid(boardId) })
      .sort({ position: -1 })
      .select('position')
      .lean();
    const position = (max?.position ?? -1) + 1;
    const list = await this.listModel.create({
      boardId: oid(boardId),
      title: dto.title.trim(),
      position,
    });
    return {
      _id: list._id.toString(),
      boardId: list.boardId.toString(),
      title: list.title,
      position: list.position,
    };
  }

  async updateList(userId: string, boardId: string, listId: string, dto: UpdateTaskListDto) {
    await this.assertBoardAccess(boardId, userId);
    const list = await this.listModel.findOne({ _id: oid(listId), boardId: oid(boardId) });
    if (!list) throw new NotFoundException('List not found');
    if (dto.title !== undefined) list.title = dto.title.trim();
    await list.save();
    return {
      _id: list._id.toString(),
      boardId: list.boardId.toString(),
      title: list.title,
      position: list.position,
    };
  }

  async deleteList(userId: string, boardId: string, listId: string) {
    await this.assertBoardAccess(boardId, userId);
    const list = await this.listModel.findOne({ _id: oid(listId), boardId: oid(boardId) });
    if (!list) throw new NotFoundException('List not found');
    const cards = await this.cardModel.find({ listId: list._id }).select('_id').lean();
    const cids = cards.map((c) => c._id);
    if (cids.length) {
      await this.commentModel.deleteMany({ cardId: { $in: cids } });
      await this.checklistModel.deleteMany({ cardId: { $in: cids } });
      await this.cardModel.deleteMany({ _id: { $in: cids } });
    }
    await this.listModel.deleteOne({ _id: list._id });
    return { deleted: true as const };
  }

  async reorderLists(userId: string, boardId: string, dto: ReorderTaskListsDto) {
    await this.assertBoardAccess(boardId, userId);
    const existing = await this.listModel.find({ boardId: oid(boardId) }).select('_id').lean();
    if (existing.length !== dto.listIds.length) {
      throw new BadRequestException('List count mismatch');
    }
    const set = new Set(existing.map((x) => x._id.toString()));
    for (const id of dto.listIds) {
      if (!set.has(id)) throw new BadRequestException('Invalid list id');
    }
    for (let i = 0; i < dto.listIds.length; i++) {
      await this.listModel.updateOne({ _id: oid(dto.listIds[i]), boardId: oid(boardId) }, { position: i });
    }
    return this.getBoardFull(userId, boardId);
  }

  async nextCardPosition(listId: Types.ObjectId): Promise<number> {
    const max = await this.cardModel.findOne({ listId }).sort({ position: -1 }).select('position').lean();
    return (max?.position ?? -1) + 1;
  }

  async createCard(userId: string, boardId: string, listId: string, dto: CreateTaskCardDto) {
    const board = await this.assertBoardAccess(boardId, userId);
    const list = await this.listModel.findOne({ _id: oid(listId), boardId: oid(boardId) });
    if (!list) throw new NotFoundException('List not found');
    const position = await this.nextCardPosition(list._id);
    const labelIds = (dto.labelIds ?? []).map((x) => oid(x));
    const assigneeIds = await this.normalizeAssignees(board, dto.assigneeIds ?? [], userId);
    await this.cardModel.create({
      boardId: oid(boardId),
      listId: list._id,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      position,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      coverColor: dto.coverColor,
      labelIds,
      assigneeIds,
    });
    return this.getBoardFull(userId, boardId);
  }

  async updateCard(userId: string, boardId: string, cardId: string, dto: UpdateTaskCardDto) {
    const board = await this.assertBoardAccess(boardId, userId);
    const card = await this.cardModel.findOne({ _id: oid(cardId), boardId: oid(boardId) });
    if (!card) throw new NotFoundException('Card not found');
    if (dto.title !== undefined) card.title = dto.title.trim();
    if (dto.description !== undefined) card.description = dto.description.trim();
    if (dto.dueDate !== undefined) {
      card.dueDate = dto.dueDate === null ? undefined : new Date(dto.dueDate);
    }
    if (dto.coverColor !== undefined) {
      card.coverColor = dto.coverColor === null ? undefined : dto.coverColor;
    }
    if (dto.labelIds !== undefined) {
      card.labelIds = dto.labelIds.map((x) => oid(x));
    }
    if (dto.assigneeIds !== undefined) {
      card.assigneeIds = await this.normalizeAssignees(board, dto.assigneeIds, userId);
    }
    if (dto.listId !== undefined && dto.listId !== card.listId.toString()) {
      const list = await this.listModel.findOne({ _id: oid(dto.listId), boardId: oid(boardId) });
      if (!list) throw new NotFoundException('Target list not found');
      card.listId = list._id;
      card.position = await this.nextCardPosition(list._id);
    }
    await card.save();
    return this.getBoardFull(userId, boardId);
  }

  async deleteCard(userId: string, boardId: string, cardId: string) {
    await this.assertBoardAccess(boardId, userId);
    const coid = oid(cardId);
    const card = await this.cardModel.findOne({ _id: coid, boardId: oid(boardId) });
    if (!card) throw new NotFoundException('Card not found');
    await this.commentModel.deleteMany({ cardId: coid });
    await this.checklistModel.deleteMany({ cardId: coid });
    await this.cardModel.deleteOne({ _id: coid });
    return this.getBoardFull(userId, boardId);
  }

  async reorderCards(userId: string, boardId: string, dto: ReorderTaskCardsDto) {
    await this.assertBoardAccess(boardId, userId);
    const boid = oid(boardId);
    const allCards = await this.cardModel.find({ boardId: boid }).select('_id listId').lean();
    const cardSet = new Map(allCards.map((c) => [c._id.toString(), c.listId.toString()]));
    const seen = new Set<string>();
    for (const col of dto.columns) {
      const list = await this.listModel.findOne({ _id: oid(col.listId), boardId: boid });
      if (!list) throw new BadRequestException('Invalid list in reorder');
      for (let i = 0; i < col.cardIds.length; i++) {
        const cid = col.cardIds[i];
        if (seen.has(cid)) throw new BadRequestException('Duplicate card in reorder');
        seen.add(cid);
        if (!cardSet.has(cid)) throw new BadRequestException('Unknown card');
        await this.cardModel.updateOne(
          { _id: oid(cid), boardId: boid },
          { listId: oid(col.listId), position: i },
        );
      }
    }
    if (seen.size !== allCards.length) {
      throw new BadRequestException('Every card must appear exactly once in reorder payload');
    }
    return this.getBoardFull(userId, boardId);
  }

  async createLabel(userId: string, boardId: string, dto: CreateTaskLabelDto) {
    await this.assertBoardAccess(boardId, userId);
    const label = await this.labelModel.create({
      boardId: oid(boardId),
      title: dto.title.trim(),
      color: dto.color,
    });
    return {
      _id: label._id.toString(),
      boardId: label.boardId.toString(),
      title: label.title,
      color: label.color,
    };
  }

  async updateLabel(userId: string, boardId: string, labelId: string, dto: UpdateTaskLabelDto) {
    await this.assertBoardAccess(boardId, userId);
    const label = await this.labelModel.findOne({ _id: oid(labelId), boardId: oid(boardId) });
    if (!label) throw new NotFoundException('Label not found');
    if (dto.title !== undefined) label.title = dto.title.trim();
    if (dto.color !== undefined) label.color = dto.color;
    await label.save();
    return {
      _id: label._id.toString(),
      boardId: label.boardId.toString(),
      title: label.title,
      color: label.color,
    };
  }

  async deleteLabel(userId: string, boardId: string, labelId: string) {
    await this.assertBoardAccess(boardId, userId);
    const lid = oid(labelId);
    await this.cardModel.updateMany({ boardId: oid(boardId), labelIds: lid }, { $pull: { labelIds: lid } });
    await this.labelModel.deleteOne({ _id: lid, boardId: oid(boardId) });
    return { deleted: true as const };
  }

  async listComments(userId: string, boardId: string, cardId: string) {
    await this.assertBoardAccess(boardId, userId);
    const card = await this.cardModel.findOne({ _id: oid(cardId), boardId: oid(boardId) });
    if (!card) throw new NotFoundException('Card not found');
    const rows = await this.commentModel.find({ cardId: card._id }).sort({ createdAt: 1 }).lean();
    const out: Array<{
      _id: string;
      cardId: string;
      userId: string;
      body: string;
      displayName: string | null;
      email: string | null;
      createdAt?: string;
    }> = [];
    for (const r of rows) {
      const u = await this.usersService.findById(r.userId.toString()).exec();
      out.push({
        _id: r._id.toString(),
        cardId: r.cardId.toString(),
        userId: r.userId.toString(),
        body: r.body,
        displayName: u?.displayName ?? null,
        email: u?.email ?? null,
        createdAt: (r as { createdAt?: Date }).createdAt?.toISOString?.(),
      });
    }
    return out;
  }

  async addComment(userId: string, boardId: string, cardId: string, dto: CreateTaskCardCommentDto) {
    await this.assertBoardAccess(boardId, userId);
    const card = await this.cardModel.findOne({ _id: oid(cardId), boardId: oid(boardId) });
    if (!card) throw new NotFoundException('Card not found');
    const c = await this.commentModel.create({
      boardId: oid(boardId),
      cardId: card._id,
      userId: oid(userId),
      body: dto.body.trim(),
    });
    const u = await this.usersService.findById(userId).exec();
    return {
      _id: c._id.toString(),
      cardId: c.cardId.toString(),
      userId: c.userId.toString(),
      body: c.body,
      displayName: u?.displayName ?? null,
      email: u?.email ?? null,
      createdAt: (c as { createdAt?: Date }).createdAt?.toISOString?.(),
    };
  }

  async deleteComment(userId: string, boardId: string, commentId: string) {
    const board = await this.assertBoardAccess(boardId, userId);
    const comment = await this.commentModel.findOne({ _id: oid(commentId), boardId: oid(boardId) });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId.toString() !== userId && board.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only the author or board owner can delete this comment');
    }
    await this.commentModel.deleteOne({ _id: comment._id });
    return { deleted: true as const };
  }

  async createChecklist(userId: string, boardId: string, cardId: string, dto: CreateTaskChecklistDto) {
    await this.assertBoardAccess(boardId, userId);
    const card = await this.cardModel.findOne({ _id: oid(cardId), boardId: oid(boardId) });
    if (!card) throw new NotFoundException('Card not found');
    const cl = await this.checklistModel.create({
      boardId: oid(boardId),
      cardId: card._id,
      title: dto.title.trim(),
      items: [],
    });
    return {
      _id: cl._id.toString(),
      cardId: cl.cardId.toString(),
      title: cl.title,
      items: [],
    };
  }

  async deleteChecklist(userId: string, boardId: string, checklistId: string) {
    await this.assertBoardAccess(boardId, userId);
    const res = await this.checklistModel.deleteOne({ _id: oid(checklistId), boardId: oid(boardId) });
    if (res.deletedCount === 0) throw new NotFoundException('Checklist not found');
    return { deleted: true as const };
  }

  async addChecklistItem(
    userId: string,
    boardId: string,
    checklistId: string,
    dto: CreateTaskChecklistItemDto,
  ) {
    await this.assertBoardAccess(boardId, userId);
    const cl = await this.checklistModel.findOne({ _id: oid(checklistId), boardId: oid(boardId) });
    if (!cl) throw new NotFoundException('Checklist not found');
    const order =
      cl.items && cl.items.length > 0 ? Math.max(...cl.items.map((i) => i.order)) + 1 : 0;
    cl.items = cl.items ?? [];
    cl.items.push({
      _id: new Types.ObjectId(),
      title: dto.title.trim(),
      done: false,
      order,
    });
    await cl.save();
    const last = cl.items[cl.items.length - 1];
    return {
      _id: last._id.toString(),
      title: last.title,
      done: last.done,
      order: last.order,
    };
  }

  async updateChecklistItem(
    userId: string,
    boardId: string,
    checklistId: string,
    itemId: string,
    dto: UpdateTaskChecklistItemDto,
  ) {
    await this.assertBoardAccess(boardId, userId);
    const cl = await this.checklistModel.findOne({ _id: oid(checklistId), boardId: oid(boardId) });
    if (!cl) throw new NotFoundException('Checklist not found');
    const item = cl.items.find((i) => i._id.toString() === itemId);
    if (!item) throw new NotFoundException('Item not found');
    if (dto.title !== undefined) item.title = dto.title.trim();
    if (dto.done !== undefined) item.done = dto.done;
    await cl.save();
    return {
      _id: item._id.toString(),
      title: item.title,
      done: item.done,
      order: item.order,
    };
  }

  async deleteChecklistItem(userId: string, boardId: string, checklistId: string, itemId: string) {
    await this.assertBoardAccess(boardId, userId);
    const cl = await this.checklistModel.findOne({ _id: oid(checklistId), boardId: oid(boardId) });
    if (!cl) throw new NotFoundException('Checklist not found');
    const before = cl.items.length;
    cl.items = cl.items.filter((i) => i._id.toString() !== itemId);
    if (cl.items.length === before) throw new NotFoundException('Item not found');
    await cl.save();
    return { deleted: true as const };
  }
}
