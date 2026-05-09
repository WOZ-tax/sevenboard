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
import { ChoshoService } from './chosho.service';

/**
 * 残高調書 API。
 *
 * GET /organizations/:orgId/chosho/preview
 *   MF 推移表 (BS) を 3 階層 row 配列に変換して返すプレビュー。DB 書き込みなし。
 *
 * 権限: org:reports:read を要求 (Phase 2 で chosho_versions 保存が入る時点で
 *      org:chosho:manage 等を新設する想定)。
 */
@Controller('organizations/:orgId/chosho')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ChoshoController {
  constructor(private service: ChoshoService) {}

  @Get('preview')
  @RequirePermission('org:reports:read')
  async preview(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.preview(orgId, fiscalYear, month);
  }
}
