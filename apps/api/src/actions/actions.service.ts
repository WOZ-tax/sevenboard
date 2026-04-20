import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ActionStatus,
  ActionEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActionDto } from './dto/create-action.dto';
import { UpdateActionDto } from './dto/update-action.dto';

export interface ListActionsFilter {
  status?: ActionStatus;
  ownerUserId?: string;
  sourceScreen?: string;
  overdueOnly?: boolean;
}

@Injectable()
export class ActionsService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string, filter: ListActionsFilter) {
    const where: Prisma.ActionWhereInput = { orgId };

    if (filter.status) where.status = filter.status;
    if (filter.ownerUserId) where.ownerUserId = filter.ownerUserId;
    if (filter.sourceScreen) {
      where.sourceScreen = filter.sourceScreen as any;
    }
    if (filter.overdueOnly) {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ['COMPLETED', 'ON_HOLD'] };
    }

    const actions = await this.prisma.action.findMany({
      where,
      orderBy: [
        { severity: 'asc' }, // HIGH < MEDIUM < LOW in enum order
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        owner: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    return actions.map(this.serialize);
  }

  async getById(orgId: string, actionId: string) {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      include: {
        owner: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        events: {
          orderBy: { eventAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!action || action.orgId !== orgId) {
      throw new NotFoundException('Actionが見つかりません');
    }

    return {
      ...this.serialize(action),
      events: action.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        eventBy: e.user.name,
        eventAt: e.eventAt.toISOString(),
        payload: e.payload,
      })),
    };
  }

  async summary(orgId: string, ownerUserId?: string) {
    const baseWhere: Prisma.ActionWhereInput = { orgId };
    if (ownerUserId) baseWhere.ownerUserId = ownerUserId;

    const [total, notStarted, inProgress, overdue] = await Promise.all([
      this.prisma.action.count({
        where: { ...baseWhere, status: { notIn: ['COMPLETED'] } },
      }),
      this.prisma.action.count({ where: { ...baseWhere, status: 'NOT_STARTED' } }),
      this.prisma.action.count({ where: { ...baseWhere, status: 'IN_PROGRESS' } }),
      this.prisma.action.count({
        where: {
          ...baseWhere,
          dueDate: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'ON_HOLD'] },
        },
      }),
    ]);

    return { total, notStarted, inProgress, overdue };
  }

  async create(orgId: string, dto: CreateActionDto, createdBy: string) {
    const action = await this.prisma.action.create({
      data: {
        orgId,
        title: dto.title,
        description: dto.description,
        sourceScreen: dto.sourceScreen,
        sourceRef: (dto.sourceRef ?? {}) as Prisma.InputJsonValue,
        severity: dto.severity ?? 'MEDIUM',
        ownerRole: dto.ownerRole ?? 'ADVISOR',
        ownerUserId: dto.ownerUserId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        linkedSlackThreadUrl: dto.linkedSlackThreadUrl,
        createdBy,
        events: {
          create: {
            eventType: ActionEventType.CREATED,
            eventBy: createdBy,
            payload: { source: dto.sourceScreen } as Prisma.InputJsonValue,
          },
        },
      },
      include: {
        owner: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    return this.serialize(action);
  }

  async update(
    orgId: string,
    actionId: string,
    dto: UpdateActionDto,
    actingUserId: string,
  ) {
    const existing = await this.prisma.action.findUnique({
      where: { id: actionId },
    });
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundException('Actionが見つかりません');
    }

    const updateData: Prisma.ActionUpdateInput = {};
    const events: Prisma.ActionEventCreateWithoutActionInput[] = [];

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.severity !== undefined) updateData.severity = dto.severity;
    if (dto.ownerRole !== undefined) updateData.ownerRole = dto.ownerRole;
    if (dto.dueDate !== undefined) {
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.linkedSlackThreadUrl !== undefined) {
      updateData.linkedSlackThreadUrl = dto.linkedSlackThreadUrl;
      events.push({
        eventType: ActionEventType.SLACK_LINKED,
        user: { connect: { id: actingUserId } },
        payload: { url: dto.linkedSlackThreadUrl } as Prisma.InputJsonValue,
      });
    }
    if (dto.ownerUserId !== undefined) {
      updateData.owner = dto.ownerUserId
        ? { connect: { id: dto.ownerUserId } }
        : { disconnect: true };
      events.push({
        eventType: ActionEventType.REASSIGNED,
        user: { connect: { id: actingUserId } },
        payload: { ownerUserId: dto.ownerUserId } as Prisma.InputJsonValue,
      });
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      updateData.status = dto.status;
      if (dto.status === 'COMPLETED') {
        updateData.completedAt = new Date();
      }
      events.push({
        eventType: ActionEventType.STATUS_CHANGED,
        user: { connect: { id: actingUserId } },
        payload: { from: existing.status, to: dto.status } as Prisma.InputJsonValue,
      });
    }
    if (dto.note) {
      events.push({
        eventType: ActionEventType.NOTE_ADDED,
        user: { connect: { id: actingUserId } },
        payload: { note: dto.note } as Prisma.InputJsonValue,
      });
    }

    if (events.length > 0) {
      updateData.events = { create: events };
    }

    const action = await this.prisma.action.update({
      where: { id: actionId },
      data: updateData,
      include: {
        owner: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    return this.serialize(action);
  }

  async remove(orgId: string, actionId: string) {
    const existing = await this.prisma.action.findUnique({
      where: { id: actionId },
    });
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundException('Actionが見つかりません');
    }
    await this.prisma.action.delete({ where: { id: actionId } });
    return { deleted: true };
  }

  private serialize = (action: any) => ({
    id: action.id,
    title: action.title,
    description: action.description,
    sourceScreen: action.sourceScreen,
    sourceRef: action.sourceRef,
    severity: action.severity,
    ownerRole: action.ownerRole,
    ownerUserId: action.ownerUserId,
    ownerName: action.owner?.name ?? null,
    dueDate: action.dueDate ? action.dueDate.toISOString().slice(0, 10) : null,
    status: action.status,
    linkedSlackThreadUrl: action.linkedSlackThreadUrl,
    createdBy: action.createdBy,
    createdByName: action.creator?.name ?? null,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
    completedAt: action.completedAt ? action.completedAt.toISOString() : null,
    isOverdue:
      action.dueDate &&
      action.dueDate < new Date() &&
      !['COMPLETED', 'ON_HOLD'].includes(action.status),
  });
}
