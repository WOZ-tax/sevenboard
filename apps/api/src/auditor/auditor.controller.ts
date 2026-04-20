import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { AuditorService } from './auditor.service';

@Controller('organizations/:orgId/auditor')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class AuditorController {
  constructor(private auditor: AuditorService) {}

  @Get('quality-check')
  async qualityCheck(@Param('orgId') orgId: string) {
    return this.auditor.checkQuality(orgId);
  }
}
