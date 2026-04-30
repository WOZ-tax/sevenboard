import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SentinelService } from './sentinel.service';

@Controller('organizations/:orgId/sentinel')
@RequirePermission('org:ai:run')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SentinelController {
  constructor(private sentinel: SentinelService) {}

  @Get('signals')
  async signals(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
    @Query('runwayMode') runwayMode?: string,
  ) {
    const mode =
      runwayMode === 'worstCase' || runwayMode === 'netBurn' || runwayMode === 'actual'
        ? runwayMode
        : undefined;
    return this.sentinel.detect(orgId, {
      fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
      endMonth: endMonth ? Number(endMonth) : undefined,
      runwayMode: mode,
    });
  }
}
