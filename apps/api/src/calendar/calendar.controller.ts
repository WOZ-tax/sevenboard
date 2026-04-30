import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@Controller('organizations/:orgId/calendar')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Get()
  @RequirePermission('org:calendar:read')
  async getEvents(
    @Param('orgId') orgId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    return this.calendarService.getEvents(orgId, y, m);
  }

  @Post()
  @RequirePermission('org:calendar:manage')
  async createEvent(
    @Param('orgId') orgId: string,
    @Body() dto: CreateCalendarEventDto,
    @Request() req: any,
  ) {
    return this.calendarService.createEvent(orgId, dto, req.user.id);
  }

  @Put(':eventId')
  @RequirePermission('org:calendar:manage')
  async updateEvent(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.updateEvent(orgId, eventId, dto);
  }

  @Delete(':eventId')
  @RequirePermission('org:calendar:manage')
  async deleteEvent(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.calendarService.deleteEvent(orgId, eventId);
  }
}
