import {
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
import { ChoshoService } from './chosho.service';
import { CreateChoshoVersionDto } from './dto/create-chosho-version.dto';
import { CreateRowCommentDto } from './dto/row-comment.dto';
import { UpsertCellCommentDto } from './dto/cell-comment.dto';
import { UpdateRowRuleDto } from './dto/row-rule.dto';

/**
 * 残高調書 API。
 *
 * GET    /organizations/:orgId/chosho/preview                  揮発 preview (DB なし)
 * POST   /organizations/:orgId/chosho/versions                 DRAFT で snapshot 保存
 * GET    /organizations/:orgId/chosho/versions/:versionId     保存済 version 取得
 *
 * 権限:
 *   read   = org:chosho:read    (preview / version GET)
 *   manage = org:chosho:manage  (POST 保存)
 *
 * IMPORTANT: NestJS の route 衝突回避のため static path (preview) を
 * dynamic path (versions/:versionId) より先に書かないと、ParseUUIDPipe で P2023 を踏む。
 */
@Controller('organizations/:orgId/chosho')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ChoshoController {
  constructor(private service: ChoshoService) {}

  @Get('preview')
  @RequirePermission('org:chosho:read')
  async preview(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.preview(orgId, fiscalYear, month);
  }

  @Post('versions')
  @RequirePermission('org:chosho:manage')
  async create(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateChoshoVersionDto,
  ) {
    return this.service.createDraft(
      orgId,
      dto.fiscalYear,
      dto.month,
      dto.title ?? null,
      req.user.id,
    );
  }

  @Get('versions/:versionId')
  @RequirePermission('org:chosho:read')
  async getVersion(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.service.getVersion(orgId, versionId);
  }

  /**
   * DRAFT → APPROVED 遷移。
   *
   * 失敗:
   *   - 404: version が指定 org に属していない
   *   - 409: status !== DRAFT、または同期間に既存 APPROVED あり
   *
   * Phase 1 では 'org:chosho:manage' で十分。「作成できるが承認できない」
   * ロールが将来必要になれば 'org:chosho:approve' を分離する余地を残す。
   */
  @Post('versions/:versionId/approve')
  @RequirePermission('org:chosho:manage')
  async approve(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.service.approve(orgId, versionId, req.user.id);
  }

  // ============================================================
  // 行ルール編集 (期待残高 / 滞留チェック)
  // ============================================================

  /**
   * chosho_rows 1 行のルール (expectedRule + expectedValue + agingCheckEnabled) を更新。
   * DRAFT 時のみ可能。APPROVED は service 層で 409 ConflictException。
   */
  @Put('versions/:versionId/rows/:rowId/rule')
  @RequirePermission('org:chosho:manage')
  async updateRowRule(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: UpdateRowRuleDto,
  ) {
    return this.service.updateRowRule(orgId, versionId, rowId, {
      expectedRule: dto.expectedRule,
      expectedValue: dto.expectedValue ?? null,
      agingCheckEnabled: dto.agingCheckEnabled,
    });
  }

  // ============================================================
  // 行コメント (1:N)
  //
  // route 順序: GET /comments と DELETE /comments/:commentId は static prefix
  // が同じなので NestJS の解決順序に依存。GET (collection) を先、
  // DELETE (item) を後に書くことで P2023 (UUID parse 失敗) を回避。
  // ============================================================

  @Get('versions/:versionId/comments')
  @RequirePermission('org:chosho:read')
  async listRowComments(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.service.listRowComments(orgId, versionId);
  }

  @Post('versions/:versionId/rows/:rowId/comments')
  @RequirePermission('org:chosho:manage')
  async addRowComment(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: CreateRowCommentDto,
  ) {
    return this.service.addRowComment(
      orgId,
      versionId,
      rowId,
      dto.body,
      dto.urls ?? [],
      req.user.id,
    );
  }

  @Delete('versions/:versionId/comments/:commentId')
  @HttpCode(204)
  @RequirePermission('org:chosho:manage')
  async deleteRowComment(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    await this.service.deleteRowComment(orgId, versionId, commentId, req.user.id);
  }

  // ============================================================
  // セルコメント (1:1, UNIQUE(row_id, month))
  // ============================================================

  @Get('versions/:versionId/cell-comments')
  @RequirePermission('org:chosho:read')
  async listCellComments(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.service.listCellComments(orgId, versionId);
  }

  @Put('versions/:versionId/rows/:rowId/cell-comments/:month')
  @RequirePermission('org:chosho:manage')
  async upsertCellComment(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Param('month', ParseIntPipe) month: number,
    @Body() dto: UpsertCellCommentDto,
  ) {
    return this.service.upsertCellComment(
      orgId,
      versionId,
      rowId,
      month,
      dto.body,
      dto.urls ?? [],
      dto.anomalyType ?? null,
      req.user.id,
    );
  }

  @Delete('versions/:versionId/rows/:rowId/cell-comments/:month')
  @HttpCode(204)
  @RequirePermission('org:chosho:manage')
  async deleteCellComment(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Param('month', ParseIntPipe) month: number,
  ): Promise<void> {
    await this.service.deleteCellComment(orgId, versionId, rowId, month);
  }

  // ============================================================
  // セルコメント (Phase 2-3 拡張: 複数 root + 返信 + 解決管理)
  // ============================================================

  /** 1セル (rowId, month) に複数 root + 返信を許容する add API。 */
  @Post('versions/:versionId/rows/:rowId/cell-comments')
  @RequirePermission('org:chosho:manage')
  async addCellComment(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body()
    dto: {
      month: number;
      body: string;
      urls?: string[];
      /** 省略可: 任意セル (異常検知なし) のコメントは null */
      anomalyType?: 'EXPECTED_VALUE_VIOLATION' | 'AGING_3M' | null;
      parentCommentId?: string;
    },
  ) {
    return this.service.addCellComment(
      orgId,
      versionId,
      rowId,
      dto.month,
      dto.body,
      dto.urls ?? [],
      dto.anomalyType ?? null,
      dto.parentCommentId ?? null,
      req.user.id,
    );
  }

  /** 解決状態 toggle (root コメント単位)。 */
  @Put('cell-comments/:commentId/resolve')
  @RequirePermission('org:chosho:manage')
  async resolveCellComment(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: { resolved: boolean },
  ) {
    return this.service.resolveCellComment(orgId, commentId, dto.resolved, req.user.id);
  }

  /** commentId 指定での delete (本人のみ)。返信もカスケード削除。 */
  @Delete('cell-comments/:commentId')
  @HttpCode(204)
  @RequirePermission('org:chosho:manage')
  async deleteCellCommentById(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    await this.service.deleteCellCommentById(orgId, commentId, req.user.id);
  }

  /** memo タブ用: 期間内最新 saved version の cell コメント全件を返す。 */
  @Get('recent-cell-comments')
  @RequirePermission('org:chosho:read')
  async listRecentCellComments(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month') monthRaw?: string,
  ) {
    // month 省略時は fiscalYear 内全月の最新 version cell comments を集約
    const month = monthRaw ? parseInt(monthRaw, 10) : undefined;
    return this.service.listRecentCellCommentsForPeriod(orgId, fiscalYear, month);
  }
}
