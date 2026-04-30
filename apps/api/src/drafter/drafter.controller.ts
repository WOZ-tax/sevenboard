import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { DrafterService } from './drafter.service';

// monthly-draft は LLM を呼び agent run も記録するため AI 系と同様に rate-limit
@Controller('organizations/:orgId/drafter')
@RequirePermission('org:ai:run')
@UseGuards(JwtAuthGuard, PermissionGuard, RateLimitGuard)
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
