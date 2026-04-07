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
  async getBudgetVersions(@Param('fyId') fyId: string) {
    return this.budgetsService.getBudgetVersions(fyId);
  }

  @Post('fiscal-years/:fyId/budget-versions')
  @Roles('ADMIN', 'CFO')
  @UseGuards(RolesGuard)
  async createBudgetVersion(
    @Param('fyId') fyId: string,
    @Body() dto: CreateBudgetVersionDto,
    @Request() req,
  ) {
    return this.budgetsService.createBudgetVersion(fyId, dto, req.user.id);
  }

  @Get('budget-versions/:bvId/entries')
  async getBudgetEntries(@Param('bvId') bvId: string) {
    return this.budgetsService.getBudgetEntries(bvId);
  }

  @Put('budget-versions/:bvId/entries')
  @Roles('ADMIN', 'CFO')
  @UseGuards(RolesGuard)
  async updateBudgetEntries(
    @Param('bvId') bvId: string,
    @Body() dto: UpdateBudgetEntriesDto,
  ) {
    return this.budgetsService.updateBudgetEntries(bvId, dto);
  }
}
