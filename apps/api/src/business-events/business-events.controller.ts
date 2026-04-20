import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { BusinessEventsService } from './business-events.service';
import { CreateBusinessEventDto } from './dto/create-business-event.dto';
import { UpdateBusinessEventDto } from './dto/update-business-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('organizations/:orgId/business-events')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class BusinessEventsController {
  constructor(private service: BusinessEventsService) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.service.list(orgId, fromDate, toDate);
  }

  @Post()
  @Roles('ADMIN', 'CFO', 'ADVISOR')
  @UseGuards(RolesGuard)
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateBusinessEventDto,
    @Request() req: any,
  ) {
    return this.service.create(orgId, dto, req.user.id);
  }

  @Patch(':eventId')
  @Roles('ADMIN', 'CFO', 'ADVISOR')
  @UseGuards(RolesGuard)
  async update(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateBusinessEventDto,
  ) {
    return this.service.update(orgId, eventId, dto);
  }

  @Delete(':eventId')
  @Roles('ADMIN', 'CFO', 'ADVISOR')
  @UseGuards(RolesGuard)
  async remove(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.service.remove(orgId, eventId);
  }
}
