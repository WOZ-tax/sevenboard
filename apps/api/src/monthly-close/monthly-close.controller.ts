import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { MonthlyCloseStatus } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { MonthlyCloseService } from './monthly-close.service';

@Controller('organizations/:orgId/monthly-closes')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MonthlyCloseController {
  constructor(private service: MonthlyCloseService) {}

  @Get()
  @RequirePermission('org:monthly_close:read')
  async list(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYearStr: string,
  ) {
    const fy = parseInt(fiscalYearStr, 10);
    if (!Number.isFinite(fy)) {
      throw new BadRequestException('fiscalYear is required');
    }
    return this.service.listForFiscalYear(orgId, fy);
  }

  @Get('default-month')
  @RequirePermission('org:monthly_close:read')
  async getDefaultMonth(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYearStr: string,
  ) {
    const fy = parseInt(fiscalYearStr, 10);
    if (!Number.isFinite(fy)) {
      throw new BadRequestException('fiscalYear is required');
    }
    const month = await this.service.resolveDefaultMonth(orgId, fy);
    return { month };
  }

  @Put(':fiscalYear/:month')
  @RequirePermission('org:monthly_close:manage')
  async setStatus(
    @Req() req: Request,
    @Param('orgId') orgId: string,
    @Param('fiscalYear') fiscalYearStr: string,
    @Param('month') monthStr: string,
    @Body() body: { status: MonthlyCloseStatus; note?: string },
  ) {
    const fy = parseInt(fiscalYearStr, 10);
    const m = parseInt(monthStr, 10);
    if (!Number.isFinite(fy)) throw new BadRequestException('Invalid fiscalYear');
    if (!Number.isFinite(m)) throw new BadRequestException('Invalid month');

    const userId = (req.user as { id?: string } | undefined)?.id;
    return this.service.setStatus(orgId, fy, m, body.status, userId, body.note);
  }
}
