import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
    @Query('month', ParseIntPipe) month: number,
  ) {
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
