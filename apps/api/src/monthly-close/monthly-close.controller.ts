import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MonthlyCloseService } from './monthly-close.service';
import type { MonthlyCloseStatus } from '@prisma/client';

@Controller('organizations/:orgId/monthly-closes')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class MonthlyCloseController {
  constructor(private service: MonthlyCloseService) {}

  /** 当該会計年度の MonthlyClose を全件取得 */
  @Get()
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

  /** デフォルト表示月の解決結果（IN_REVIEW > CLOSED > null）*/
  @Get('default-month')
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

  /** ステータス変更（upsert）。ADMIN/ADVISOR 限定 */
  @Put(':fiscalYear/:month')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
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
