import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('organizations/:orgId/calendar')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Get()
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
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async createEvent(
    @Param('orgId') orgId: string,
    @Body() dto: CreateCalendarEventDto,
    @Request() req: any,
  ) {
    return this.calendarService.createEvent(orgId, dto, req.user.id);
  }

  @Put(':eventId')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async updateEvent(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.updateEvent(orgId, eventId, dto);
  }

  @Delete(':eventId')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async deleteEvent(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.calendarService.deleteEvent(orgId, eventId);
  }
}
