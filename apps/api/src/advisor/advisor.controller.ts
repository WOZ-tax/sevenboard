import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InternalStaffGuard } from '../auth/internal-staff.guard';
import { AdvisorService } from './advisor.service';

/**
 * /advisor/* は SEVENRICH 内部スタッフ専用（owner / advisor で orgId=NULL）。
 *
 * 重要: orgId 無しの route のため RolesGuard では global role を見るだけで
 * tenant owner（user.orgId 持ち、role='owner'）も通ってしまう。InternalStaffGuard
 * で orgId=NULL を要求することでクロステナント漏洩を防ぐ。
 */
@Controller('advisor')
@UseGuards(JwtAuthGuard, InternalStaffGuard)
export class AdvisorController {
  constructor(private advisorService: AdvisorService) {}

  /**
   * 顧問先一覧（ページネーション + 検索 + フィルタ）
   */
  @Get('organizations')
  async listOrganizations(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('industry') industry?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '20', 10) || 20));

    return this.advisorService.listOrganizations(req.user, {
      page: pageNum,
      limit: limitNum,
      search: search || undefined,
      industry: industry || undefined,
      sortBy: sortBy || undefined,
      order: order || undefined,
    });
  }

  /**
   * 横断サマリー（全顧問先のKPI概要）
   */
  @Get('summary')
  async getSummary(@Request() req) {
    return this.advisorService.getSummary(req.user);
  }

  /**
   * 最近アクセスした顧問先（直近10件）
   */
  @Get('recent')
  async getRecentOrgs(@Request() req) {
    return this.advisorService.getRecentOrgs(req.user);
  }
}
