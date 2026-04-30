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
import { ActionStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ActionsService } from './actions.service';
import { CreateActionDto } from './dto/create-action.dto';
import { UpdateActionDto } from './dto/update-action.dto';

@Controller('organizations/:orgId/actions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ActionsController {
  constructor(private actionsService: ActionsService) {}

  @Get()
  @RequirePermission('org:actions:read')
  async list(
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('sourceScreen') sourceScreen?: string,
    @Query('overdueOnly') overdueOnly?: string,
  ) {
    return this.actionsService.list(orgId, {
      status: status as ActionStatus | undefined,
      ownerUserId,
      sourceScreen,
      overdueOnly: overdueOnly === 'true',
    });
  }

  @Get('summary')
  @RequirePermission('org:actions:read')
  async summary(
    @Param('orgId') orgId: string,
    @Query('ownerUserId') ownerUserId?: string,
  ) {
    return this.actionsService.summary(orgId, ownerUserId);
  }

  @Get(':actionId')
  @RequirePermission('org:actions:read')
  async getById(
    @Param('orgId') orgId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.actionsService.getById(orgId, actionId);
  }

  @Post()
  @RequirePermission('org:actions:manage')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateActionDto,
    @Request() req: any,
  ) {
    return this.actionsService.create(orgId, dto, req.user.id);
  }

  @Patch(':actionId')
  @RequirePermission('org:actions:manage')
  async update(
    @Param('orgId') orgId: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateActionDto,
    @Request() req: any,
  ) {
    return this.actionsService.update(orgId, actionId, dto, req.user.id);
  }

  @Delete(':actionId')
  @RequirePermission('org:actions:manage')
  async remove(
    @Param('orgId') orgId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.actionsService.remove(orgId, actionId);
  }
}
