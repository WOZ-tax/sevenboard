import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessEventDto } from './dto/create-business-event.dto';
import { UpdateBusinessEventDto } from './dto/update-business-event.dto';

@Injectable()
export class BusinessEventsService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string, fromDate?: string, toDate?: string) {
    const where: any = { orgId };
    if (fromDate || toDate) {
      where.eventDate = {};
      if (fromDate) where.eventDate.gte = new Date(fromDate);
      if (toDate) where.eventDate.lte = new Date(toDate);
    }
    const events = await this.prisma.businessEvent.findMany({
      where,
      orderBy: { eventDate: 'desc' },
      include: { creator: { select: { id: true, name: true } } },
    });
    return events.map((e) => this.serialize(e));
  }

  async create(orgId: string, dto: CreateBusinessEventDto, createdBy: string) {
    const event = await this.prisma.businessEvent.create({
      data: {
        orgId,
        eventDate: new Date(dto.eventDate),
        eventType: dto.eventType,
        title: dto.title,
        note: dto.note,
        impactTags: dto.impactTags ?? [],
        createdBy,
      },
      include: { creator: { select: { id: true, name: true } } },
    });
    return this.serialize(event);
  }

  async update(orgId: string, eventId: string, dto: UpdateBusinessEventDto) {
    const existing = await this.prisma.businessEvent.findUnique({
      where: { id: eventId },
    });
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundException('経営イベントが見つかりません');
    }

    const data: any = {};
    if (dto.eventDate !== undefined) data.eventDate = new Date(dto.eventDate);
    if (dto.eventType !== undefined) data.eventType = dto.eventType;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.impactTags !== undefined) data.impactTags = dto.impactTags;

    const event = await this.prisma.businessEvent.update({
      where: { id: eventId },
      data,
      include: { creator: { select: { id: true, name: true } } },
    });
    return this.serialize(event);
  }

  async remove(orgId: string, eventId: string) {
    const existing = await this.prisma.businessEvent.findUnique({
      where: { id: eventId },
    });
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundException('経営イベントが見つかりません');
    }
    await this.prisma.businessEvent.delete({ where: { id: eventId } });
    return { deleted: true };
  }

  private serialize(event: any) {
    return {
      id: event.id,
      eventDate: event.eventDate.toISOString().slice(0, 10),
      eventType: event.eventType,
      title: event.title,
      note: event.note,
      impactTags: event.impactTags,
      createdBy: event.createdBy,
      createdByName: event.creator?.name ?? null,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
