import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async getEvents(orgId: string, year: number, month: number) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    // month is 1-12, build range that includes prev/next month edges for calendar display
    const startDate = new Date(year, month - 2, 1); // prev month start
    const endDate = new Date(year, month + 1, 0); // next month end

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        orgId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
    });

    return events.map((e) => ({
      ...e,
      date: e.date.toISOString().slice(0, 10),
    }));
  }

  async createEvent(
    orgId: string,
    dto: CreateCalendarEventDto,
    createdBy: string,
  ) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const event = await this.prisma.calendarEvent.create({
      data: {
        tenantId,
        orgId,
        title: dto.title,
        date: new Date(dto.date),
        type: dto.type || 'task',
        description: dto.description || null,
        createdBy,
      },
    });

    return {
      ...event,
      date: event.date.toISOString().slice(0, 10),
    };
  }

  async updateEvent(
    orgId: string,
    eventId: string,
    dto: UpdateCalendarEventDto,
  ) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const existing = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId, orgId },
    });

    if (!existing) {
      throw new NotFoundException('イベントが見つかりません');
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.date !== undefined) updateData.date = new Date(dto.date);
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.description !== undefined) updateData.description = dto.description;

    const event = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: updateData,
    });

    return {
      ...event,
      date: event.date.toISOString().slice(0, 10),
    };
  }

  async deleteEvent(orgId: string, eventId: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const existing = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId, orgId },
    });

    if (!existing) {
      throw new NotFoundException('イベントが見つかりません');
    }

    await this.prisma.calendarEvent.delete({
      where: { id: eventId },
    });

    return { deleted: true };
  }
}
