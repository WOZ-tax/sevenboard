import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AlertsService } from './alerts.service';

@Controller('organizations/:orgId/alerts')
@RequirePermission('org:insights:read')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get()
  async getAlerts(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fy?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    let fiscalYear: number | undefined;
    if (fy) {
      fiscalYear = parseInt(fy, 10);
      if (isNaN(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2100) {
        throw new BadRequestException('Invalid fiscal year');
      }
    }
    let em: number | undefined;
    if (endMonth) {
      em = parseInt(endMonth, 10);
      if (isNaN(em) || em < 1 || em > 12) {
        throw new BadRequestException('Invalid month (1-12)');
      }
    }
    return this.alertsService.detectAlerts(orgId, fiscalYear, em);
  }
}
