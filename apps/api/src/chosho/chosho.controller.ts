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
      dto.anomalyType,
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
}
