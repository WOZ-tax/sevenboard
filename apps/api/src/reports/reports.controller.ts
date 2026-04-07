import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';

@Controller('organizations/:orgId/reports')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('variance')
  async getVariance(
    @Param('orgId') orgId: string,
    @Query('budgetVersionId') budgetVersionId: string,
    @Query('startMonth') startMonth?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.reportsService.getVarianceReport(orgId, {
      budgetVersionId,
      startMonth,
      endMonth,
    });
  }

  @Get('pl')
  async getPl(
    @Param('orgId') orgId: string,
    @Query('startMonth') startMonth?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.reportsService.getPlReport(orgId, { startMonth, endMonth });
  }

  @Get('variable-cost')
  async getVariableCost(
    @Param('orgId') orgId: string,
    @Query('month') month?: string,
  ) {
    return this.reportsService.getVariableCostReport(orgId, month);
  }
}
