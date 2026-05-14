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
import { LocabenService } from './locaben.service';

@Controller('organizations/:orgId/locaben')
@RequirePermission('org:mf:read')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LocabenController {
  constructor(private readonly svc: LocabenService) {}

  private parseFiscalYear(value?: string): number | undefined {
    if (!value) return undefined;
    const fy = parseInt(value, 10);
    if (isNaN(fy) || fy < 1900 || fy > 2100) {
      throw new BadRequestException('Invalid fiscal year');
    }
    return fy;
  }

  private parseMonth(value?: string): number | undefined {
    if (!value) return undefined;
    const m = parseInt(value, 10);
    if (isNaN(m) || m < 1 || m > 12) {
      throw new BadRequestException('Invalid month (1-12)');
    }
    return m;
  }

  @Get('source-data')
  async getSourceData(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.svc.getSourceData(
      orgId,
      this.parseFiscalYear(fiscalYear),
      this.parseMonth(endMonth),
    );
  }
}
