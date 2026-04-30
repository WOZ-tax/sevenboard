import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('organizations/:orgId/sync')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post('run')
  @RequirePermission('org:sync:run')
  async runSync(@Param('orgId') orgId: string) {
    return this.syncService.runSync(orgId);
  }

  @Get('status')
  @RequirePermission('org:sync:read')
  async getSyncStatus(@Param('orgId') orgId: string) {
    return this.syncService.getSyncStatus(orgId);
  }
}
