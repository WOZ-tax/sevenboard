import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TriageService } from './triage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('organizations/:orgId/triage')
@RequirePermission('org:insights:read')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TriageController {
  constructor(private triage: TriageService) {}

  @Get('classify')
  async classify(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.triage.classify(orgId, {
      fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
      endMonth: endMonth ? Number(endMonth) : undefined,
    });
  }
}
