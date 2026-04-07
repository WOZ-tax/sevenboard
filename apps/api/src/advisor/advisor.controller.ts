import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdvisorService } from './advisor.service';

@Controller('advisor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADVISOR')
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

    return this.advisorService.listOrganizations(req.user.id, req.user.role, {
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
    return this.advisorService.getSummary(req.user.id, req.user.role);
  }

  /**
   * 最近アクセスした顧問先（直近10件）
   */
  @Get('recent')
  async getRecentOrgs(@Request() req) {
    return this.advisorService.getRecentOrgs(req.user.id, req.user.role);
  }
}
