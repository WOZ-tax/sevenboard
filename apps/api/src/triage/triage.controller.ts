import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TriageService } from './triage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';

@Controller('organizations/:orgId/triage')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
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
