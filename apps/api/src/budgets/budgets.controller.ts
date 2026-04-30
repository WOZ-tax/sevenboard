import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateBudgetVersionDto } from './dto/create-budget-version.dto';
import { UpdateBudgetEntriesDto } from './dto/update-budget-entries.dto';
import { ResolveOrgFromBudgetParam } from './resolve-org-param.interceptor';

@Controller()
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private budgetsService: BudgetsService) {}

  @Get('organizations/:orgId/fiscal-years')
  @RequirePermission('org:budgets:read')
  @UseGuards(PermissionGuard)
  async getFiscalYears(@Param('orgId') orgId: string) {
    return this.budgetsService.getFiscalYears(orgId);
  }

  @Get('fiscal-years/:fyId/budget-versions')
  @RequirePermission('org:budgets:read')
  @UseGuards(ResolveOrgFromBudgetParam, PermissionGuard)
  async getBudgetVersions(@Param('fyId') fyId: string, @Request() req) {
    return this.budgetsService.getBudgetVersions(req.user, fyId);
  }

  @Post('fiscal-years/:fyId/budget-versions')
  @RequirePermission('org:budgets:update')
  @UseGuards(ResolveOrgFromBudgetParam, PermissionGuard)
  async createBudgetVersion(
    @Param('fyId') fyId: string,
    @Body() dto: CreateBudgetVersionDto,
    @Request() req,
  ) {
    return this.budgetsService.createBudgetVersion(req.user, fyId, dto);
  }

  @Get('budget-versions/:bvId/entries')
  @RequirePermission('org:budgets:read')
  @UseGuards(ResolveOrgFromBudgetParam, PermissionGuard)
  async getBudgetEntries(@Param('bvId') bvId: string, @Request() req) {
    return this.budgetsService.getBudgetEntries(req.user, bvId);
  }

  @Put('budget-versions/:bvId/entries')
  @RequirePermission('org:budgets:update')
  @UseGuards(ResolveOrgFromBudgetParam, PermissionGuard)
  async updateBudgetEntries(
    @Param('bvId') bvId: string,
    @Body() dto: UpdateBudgetEntriesDto,
    @Request() req,
  ) {
    return this.budgetsService.updateBudgetEntries(req.user, bvId, dto);
  }
}
