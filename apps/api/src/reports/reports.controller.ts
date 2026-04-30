import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('organizations/:orgId/reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('variance')
  @RequirePermission('org:reports:read')
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
  @RequirePermission('org:reports:read')
  async getPl(
    @Param('orgId') orgId: string,
    @Query('startMonth') startMonth?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.reportsService.getPlReport(orgId, { startMonth, endMonth });
  }

  @Get('variable-cost')
  @RequirePermission('org:reports:read')
  async getVariableCost(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.reportsService.getVariableCostReport(
      orgId,
      fiscalYear ? Number(fiscalYear) : undefined,
      endMonth ? Number(endMonth) : undefined,
    );
  }
}
