import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AuditorService } from './auditor.service';

@Controller('organizations/:orgId/auditor')
@RequirePermission('org:ai:run')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AuditorController {
  constructor(private auditor: AuditorService) {}

  @Get('quality-check')
  async qualityCheck(@Param('orgId') orgId: string) {
    return this.auditor.checkQuality(orgId);
  }
}
