import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { HealthSnapshotsService } from './health-snapshots.service';
import { HealthQuestionsService } from './health-questions.service';
import { RefreshHealthSnapshotDto } from './dto/refresh.dto';

/**
 * 会計レビュー画面 ① 健康サマリーの API。
 *
 * GET    latest                  最新スナップショット
 * GET    by-month?fy=&month=     特定月のスナップショット
 * GET    history?months=12       過去 N ヶ月の履歴 (グラフ用)
 * POST   refresh                 手動再計算 (任意で AI 質問も生成)
 */
@Controller('organizations/:orgId/health-snapshot')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class HealthSnapshotsController {
  constructor(
    private snapshots: HealthSnapshotsService,
    private questions: HealthQuestionsService,
  ) {}

  @Get('latest')
  @RequirePermission('org:risk_findings:read')
  async getLatest(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.snapshots.getLatest(orgId);
  }

  @Get('by-month')
  @RequirePermission('org:risk_findings:read')
  async getByMonth(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.snapshots.getByMonth(orgId, fiscalYear, month);
  }

  @Get('history')
  @RequirePermission('org:risk_findings:read')
  async getHistory(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('months', ParseIntPipe) months: number,
  ) {
    return this.snapshots.getHistory(orgId, months);
  }

  @Post('refresh')
  @RequirePermission('org:risk_findings:scan')
  async refresh(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: RefreshHealthSnapshotDto,
  ) {
    // まずスコア計算 + 保存 (AI 質問は後段で差し込み)
    const saved = await this.snapshots.computeAndSave(
      orgId,
      dto.fiscalYear,
      dto.month,
    );

    if (!dto.generateAiQuestions) {
      return saved;
    }

    // AI 質問生成 (LLM コール)
    const questions = await this.questions.generate({
      fiscalYear: dto.fiscalYear,
      month: dto.month,
      score: saved.score,
      prevScore: saved.prevScore,
      breakdown: saved.breakdown,
      indicators: saved.indicators,
    });
    return this.snapshots.updateAiQuestions(
      orgId,
      dto.fiscalYear,
      dto.month,
      questions,
    );
  }
}
