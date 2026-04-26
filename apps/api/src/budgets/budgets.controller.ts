import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateBudgetVersionDto } from './dto/create-budget-version.dto';
import { UpdateBudgetEntriesDto } from './dto/update-budget-entries.dto';
import { ResolveOrgFromBudgetParam } from './resolve-org-param.interceptor';

@Controller()
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private budgetsService: BudgetsService) {}

  @Get('organizations/:orgId/fiscal-years')
  @UseGuards(OrgAccessGuard)
  async getFiscalYears(@Param('orgId') orgId: string) {
    return this.budgetsService.getFiscalYears(orgId);
  }

  @Get('fiscal-years/:fyId/budget-versions')
  @UseGuards(ResolveOrgFromBudgetParam, OrgAccessGuard)
  async getBudgetVersions(@Param('fyId') fyId: string, @Request() req) {
    return this.budgetsService.getBudgetVersions(req.user, fyId);
  }

  @Post('fiscal-years/:fyId/budget-versions')
  // ResolveOrgFromBudgetParam: fyId から親 orgId を params に流し込み、後段の RolesGuard を
  // org-aware に駆動。OrgAccessGuard も並走させて二重防御。
  @UseGuards(ResolveOrgFromBudgetParam, OrgAccessGuard, RolesGuard)
  @Roles('owner', 'advisor')
  async createBudgetVersion(
    @Param('fyId') fyId: string,
    @Body() dto: CreateBudgetVersionDto,
    @Request() req,
  ) {
    return this.budgetsService.createBudgetVersion(req.user, fyId, dto);
  }

  @Get('budget-versions/:bvId/entries')
  @UseGuards(ResolveOrgFromBudgetParam, OrgAccessGuard)
  async getBudgetEntries(@Param('bvId') bvId: string, @Request() req) {
    return this.budgetsService.getBudgetEntries(req.user, bvId);
  }

  @Put('budget-versions/:bvId/entries')
  // bvId → 親 orgId を解決して RolesGuard / OrgAccessGuard を org-aware に動かす
  @UseGuards(ResolveOrgFromBudgetParam, OrgAccessGuard, RolesGuard)
  @Roles('owner', 'advisor')
  async updateBudgetEntries(
    @Param('bvId') bvId: string,
    @Body() dto: UpdateBudgetEntriesDto,
    @Request() req,
  ) {
    return this.budgetsService.updateBudgetEntries(req.user, bvId, dto);
  }
}
