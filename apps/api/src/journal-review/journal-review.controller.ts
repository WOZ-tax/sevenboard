import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { JournalReviewService } from './journal-review.service';
import { UpsertJournalFlagDto } from './dto/upsert-flag.dto';

/**
 * 仕訳レビュー API:
 *   GET    /organizations/:orgId/journal-flags?fiscalYear=&month=  期間内の flag 一覧
 *   PUT    /organizations/:orgId/journal-flags/:journalId           flag toggle (upsert)
 *   DELETE /organizations/:orgId/journal-flags/:journalId           flag 削除 (運用上ほぼ不要)
 *
 * journalId は MF v3 の仕訳 id 文字列をそのまま受ける (UUID の場合もあるが TEXT 比較)。
 */
@Controller('organizations/:orgId/journal-flags')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class JournalReviewController {
  constructor(private service: JournalReviewService) {}

  @Get()
  @RequirePermission('org:journal_review:read')
  async list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month') monthRaw?: string,
  ) {
    // month 省略時は fiscalYear 全期間 (memo タブで「全期間」モード)
    const month = monthRaw ? parseInt(monthRaw, 10) : undefined;
    return this.service.listFlags(orgId, fiscalYear, month);
  }

  @Put(':journalId')
  @RequirePermission('org:journal_review:manage')
  async upsert(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('journalId') journalId: string,
    @Body() dto: UpsertJournalFlagDto,
    @Query('fiscalYear') fyQuery?: string,
    @Query('month') mQuery?: string,
  ) {
    // fiscalYear / month は body 優先、 query は fallback (UI 都合の互換)
    const fiscalYear = dto.fiscalYear ?? (fyQuery ? parseInt(fyQuery, 10) : 0);
    const month = dto.month ?? (mQuery ? parseInt(mQuery, 10) : 0);
    return this.service.upsertFlag(
      orgId,
      journalId,
      fiscalYear,
      month,
      dto.resolved,
      req.user.id,
    );
  }

  @Delete(':journalId')
  @HttpCode(204)
  @RequirePermission('org:journal_review:manage')
  async delete(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('journalId') journalId: string,
  ): Promise<void> {
    await this.service.deleteFlag(orgId, journalId);
  }
}

@Controller('organizations/:orgId/journal-review')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class JournalReviewSnapshotsController {
  constructor(private service: JournalReviewService) {}

  @Get('memo-flags')
  @RequirePermission('org:journal_review:read')
  async listMemoFlags(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month') monthRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const month = parseOptionalMonth(monthRaw, 'month');
    const page = pageRaw ? Number(pageRaw) : 1;
    const limit = limitRaw ? Number(limitRaw) : 50;
    return this.service.listFlagsPage(orgId, fiscalYear, month, page, limit);
  }

  @Get('snapshots')
  @RequirePermission('org:journal_review:read')
  async listSnapshots(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month') monthRaw?: string,
    @Query('throughMonth') throughMonthRaw?: string,
    @Query('journalIds') journalIdsCsv?: string,
  ) {
    const month = parseOptionalMonth(monthRaw, 'month');
    const throughMonth = parseOptionalMonth(throughMonthRaw, 'throughMonth');
    const journalIds = journalIdsCsv
      ? journalIdsCsv.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return this.service.listSnapshots(orgId, fiscalYear, month, throughMonth, journalIds);
  }

  /** 指定月 (省略時は fy 全月) の snapshot cache を破棄して MF から再取得させる。 */
  @Post('snapshots/refresh')
  @RequirePermission('org:journal_review:manage')
  async refreshSnapshots(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: { fiscalYear: number; month?: number },
  ) {
    return this.service.refreshSnapshots(orgId, dto.fiscalYear, dto.month);
  }
}

function parseOptionalMonth(value: string | undefined, label: string): number | undefined {
  if (value == null || value === '') return undefined;
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException(`${label} must be an integer between 1 and 12`);
  }
  return month;
}
