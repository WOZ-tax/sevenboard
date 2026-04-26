import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { DrafterService } from './drafter.service';

@Controller('organizations/:orgId/drafter')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class DrafterController {
  constructor(private drafter: DrafterService) {}

  @Get('monthly-draft')
  async monthlyDraft(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
    @Query('runwayMode') runwayMode?: string,
  ) {
    const mode =
      runwayMode === 'worstCase' || runwayMode === 'netBurn' || runwayMode === 'actual'
        ? runwayMode
        : undefined;
    return this.drafter.generateMonthlyDraft(orgId, {
      fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
      endMonth: endMonth ? Number(endMonth) : undefined,
      runwayMode: mode,
    });
  }
}
