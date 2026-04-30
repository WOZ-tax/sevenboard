import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationType, Prisma } from '@prisma/client';

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
  linkHref?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async list(
    orgId: string,
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number; days?: number },
  ): Promise<NotificationDto[]> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
    const since = new Date();
    since.setDate(since.getDate() - (options?.days ?? 30));

    const rows = await this.prisma.notification.findMany({
      where: {
        tenantId,
        orgId,
        OR: [{ userId }, { userId: null }],
        ...(options?.unreadOnly ? { isRead: false } : {}),
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => toDto(r));
  }

  async unreadCount(orgId: string, userId: string): Promise<number> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    return this.prisma.notification.count({
      where: {
        tenantId,
        orgId,
        OR: [{ userId }, { userId: null }],
        isRead: false,
      },
    });
  }

  async markRead(
    orgId: string,
    userId: string,
    id: string,
  ): Promise<NotificationDto | null> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const row = await this.prisma.notification.findFirst({
      where: {
        id,
        tenantId,
        orgId,
        OR: [{ userId }, { userId: null }],
      },
    });
    if (!row) return null;
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return toDto(updated);
  }

  async markAllRead(orgId: string, userId: string): Promise<{ count: number }> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const res = await this.prisma.notification.updateMany({
      where: {
        tenantId,
        orgId,
        OR: [{ userId }, { userId: null }],
        isRead: false,
      },
      data: { isRead: true },
    });
    return { count: res.count };
  }

  async create(input: {
    orgId: string;
    userId?: string | null;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDto> {
    const { tenantId } = await this.prisma.orgScope(input.orgId);
    const row = await this.prisma.notification.create({
      data: {
        tenantId,
        orgId: input.orgId,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata:
          (input.metadata ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
    return toDto(row);
  }
}

function toDto(row: {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  metadata: unknown;
}): NotificationDto {
  const metadata =
    typeof row.metadata === 'object' && row.metadata !== null
      ? (row.metadata as Record<string, unknown>)
      : {};
  const linkHref =
    typeof metadata.linkHref === 'string' ? metadata.linkHref : undefined;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
    metadata,
    linkHref,
  };
}
