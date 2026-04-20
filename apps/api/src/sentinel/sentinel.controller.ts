import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { SentinelService } from './sentinel.service';

@Controller('organizations/:orgId/sentinel')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class SentinelController {
  constructor(private sentinel: SentinelService) {}

  @Get('signals')
  async signals(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.sentinel.detect(orgId, {
      fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
      endMonth: endMonth ? Number(endMonth) : undefined,
    });
  }
}
