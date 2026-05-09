import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ChoshoService } from './chosho.service';
import { CreateChoshoVersionDto } from './dto/create-chosho-version.dto';

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
}
