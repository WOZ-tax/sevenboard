import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { DataHealthService } from './data-health.service';

@Controller('organizations/:orgId/data-health')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DataHealthController {
  constructor(private dataHealthService: DataHealthService) {}

  @Get()
  @RequirePermission('org:sync:read')
  async status(@Param('orgId') orgId: string) {
    return this.dataHealthService.getStatus(orgId);
  }

  @Get('logs')
  @RequirePermission('org:sync:read')
  async logs(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string,
  ) {
    let n = 50;
    if (limit) {
      n = parseInt(limit, 10);
      if (isNaN(n) || n < 1 || n > 200) {
        throw new BadRequestException('limit は 1〜200 の範囲で指定してください');
      }
    }
    return this.dataHealthService.getRecentLogs(orgId, n);
  }
}
