import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WithholdingTaxService } from './withholding-tax.service';

@Controller('organizations/:orgId/withholding-tax')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class WithholdingTaxController {
  constructor(private service: WithholdingTaxService) {}

  @Get('preview')
  @RequirePermission('org:withholding_tax:read')
  async preview(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear') fiscalYearRaw?: string,
    @Query('month') monthRaw?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const fiscalYear = fiscalYearRaw ? Number(fiscalYearRaw) : undefined;
    const month = monthRaw ? Number(monthRaw) : undefined;
    return this.service.preview(orgId, {
      fiscalYear,
      month,
      startDate,
      endDate,
    });
  }
}
