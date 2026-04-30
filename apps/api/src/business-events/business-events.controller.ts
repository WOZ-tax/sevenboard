import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { BusinessEventsService } from './business-events.service';
import { CreateBusinessEventDto } from './dto/create-business-event.dto';
import { UpdateBusinessEventDto } from './dto/update-business-event.dto';

@Controller('organizations/:orgId/business-events')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BusinessEventsController {
  constructor(private service: BusinessEventsService) {}

  @Get()
  @RequirePermission('org:business_events:read')
  async list(
    @Param('orgId') orgId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.service.list(orgId, fromDate, toDate);
  }

  @Post()
  @RequirePermission('org:business_events:manage')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateBusinessEventDto,
    @Request() req: any,
  ) {
    return this.service.create(orgId, dto, req.user.id);
  }

  @Patch(':eventId')
  @RequirePermission('org:business_events:manage')
  async update(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateBusinessEventDto,
  ) {
    return this.service.update(orgId, eventId, dto);
  }

  @Delete(':eventId')
  @RequirePermission('org:business_events:manage')
  async remove(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.service.remove(orgId, eventId);
  }
}
