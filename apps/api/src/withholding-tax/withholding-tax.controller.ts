import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month') monthRaw?: string,
  ) {
    const month = monthRaw ? parseInt(monthRaw, 10) : undefined;
    return this.service.preview(orgId, fiscalYear, month);
  }
}
