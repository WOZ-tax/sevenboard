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
import { ActionsService } from './actions.service';
import { CreateActionDto } from './dto/create-action.dto';
import { UpdateActionDto } from './dto/update-action.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ActionStatus } from '@prisma/client';

@Controller('organizations/:orgId/actions')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class ActionsController {
  constructor(private actionsService: ActionsService) {}

  @Get()
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
  async summary(
    @Param('orgId') orgId: string,
    @Query('ownerUserId') ownerUserId?: string,
  ) {
    return this.actionsService.summary(orgId, ownerUserId);
  }

  @Get(':actionId')
  async getById(
    @Param('orgId') orgId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.actionsService.getById(orgId, actionId);
  }

  @Post()
  @Roles('ADMIN', 'CFO', 'ADVISOR')
  @UseGuards(RolesGuard)
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateActionDto,
    @Request() req: any,
  ) {
    return this.actionsService.create(orgId, dto, req.user.id);
  }

  @Patch(':actionId')
  @Roles('ADMIN', 'CFO', 'ADVISOR')
  @UseGuards(RolesGuard)
  async update(
    @Param('orgId') orgId: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateActionDto,
    @Request() req: any,
  ) {
    return this.actionsService.update(orgId, actionId, dto, req.user.id);
  }

  @Delete(':actionId')
  @Roles('ADMIN', 'CFO', 'ADVISOR')
  @UseGuards(RolesGuard)
  async remove(
    @Param('orgId') orgId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.actionsService.remove(orgId, actionId);
  }
}
