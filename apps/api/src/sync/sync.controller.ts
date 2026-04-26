import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('organizations/:orgId/sync')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post('run')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async runSync(@Param('orgId') orgId: string) {
    return this.syncService.runSync(orgId);
  }

  @Get('status')
  async getSyncStatus(@Param('orgId') orgId: string) {
    return this.syncService.getSyncStatus(orgId);
  }
}
