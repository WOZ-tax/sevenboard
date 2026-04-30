import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { AiService } from './ai.service';

@Controller('organizations/:orgId/ai')
@RequirePermission('org:ai:run')
@UseGuards(JwtAuthGuard, PermissionGuard, RateLimitGuard)
export class AiController {
  constructor(private aiService: AiService) {}

  private parseFy(fiscalYear?: string): number | undefined {
    if (!fiscalYear) return undefined;
    const fy = parseInt(fiscalYear, 10);
    if (isNaN(fy) || fy < 1900 || fy > 2100) {
      throw new BadRequestException('Invalid fiscal year');
    }
    return fy;
  }

  private parseRunwayMode(value?: string): 'worstCase' | 'netBurn' | 'actual' | undefined {
    return value === 'worstCase' || value === 'netBurn' || value === 'actual'
      ? value
      : undefined;
  }

  @Get('summary')
  async getSummary(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
    @Query('runwayMode') runwayMode?: string,
    @Query('focus') focus?: string,
  ) {
    const em = endMonth ? parseInt(endMonth, 10) : undefined;
    const validFocus: 'all' | 'revenue' | 'cost' | 'cashflow' | 'indicators' =
      focus === 'revenue' ||
      focus === 'cost' ||
      focus === 'cashflow' ||
      focus === 'indicators'
        ? focus
        : 'all';
    return this.aiService.generateMonthlySummary(
      orgId,
      this.parseFy(fiscalYear),
      em,
      this.parseRunwayMode(runwayMode),
      validFocus,
    );
  }

  @Get('talk-script')
  async getTalkScript(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
    @Query('runwayMode') runwayMode?: string,
  ) {
    const em = endMonth ? parseInt(endMonth, 10) : undefined;
    return this.aiService.generateTalkScript(
      orgId,
      this.parseFy(fiscalYear),
      em,
      this.parseRunwayMode(runwayMode),
    );
  }

  @Get('budget-scenarios')
  async getBudgetScenarios(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('runwayMode') runwayMode?: string,
  ) {
    return this.aiService.generateBudgetScenarios(
      orgId,
      this.parseFy(fiscalYear),
      undefined,
      this.parseRunwayMode(runwayMode),
    );
  }

  @Post('budget-scenarios')
  async generateBudgetScenariosWithParams(
    @Param('orgId') orgId: string,
    @Body() body: {
      fiscalYear?: number;
      baseGrowthRate?: number;
      upsideGrowthRate?: number;
      downsideGrowthRate?: number;
      newHires?: number;
      costReductionRate?: number;
      notes?: string;
      runwayMode?: 'worstCase' | 'netBurn' | 'actual';
    },
  ) {
    return this.aiService.generateBudgetScenarios(
      orgId,
      body.fiscalYear,
      body,
      this.parseRunwayMode(body.runwayMode),
    );
  }

  @Get('funding-report')
  async getFundingReport(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
    @Query('runwayMode') runwayMode?: string,
  ) {
    const em = endMonth ? parseInt(endMonth, 10) : undefined;
    return this.aiService.generateFundingReport(
      orgId,
      this.parseFy(fiscalYear),
      undefined,
      em,
      this.parseRunwayMode(runwayMode),
    );
  }

  /**
   * 財務指標ページの AI CFO 解説を生成。
   * 安全性 / 収益性 / 効率性 の 3 カテゴリ × CFO トーンで自動解説。
   */
  @Get('indicators-commentary')
  async getIndicatorsCommentary(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    const em = endMonth ? parseInt(endMonth, 10) : undefined;
    return this.aiService.generateIndicatorsCommentary(
      orgId,
      this.parseFy(fiscalYear),
      em,
    );
  }

  /** 融資シミュレーションのシナリオを添えてレポート再生成 */
  @Post('funding-report')
  async generateFundingReportWithScenarios(
    @Param('orgId') orgId: string,
    @Body() body: {
      fiscalYear?: number;
      endMonth?: number;
      scenarios?: Array<{
        name: string;
        principal: number;
        monthlyPayment: number;
        totalInterest: number;
        termMonths: number;
        interestRate: number;
      }>;
    },
  ) {
    return this.aiService.generateFundingReport(
      orgId,
      body.fiscalYear,
      body.scenarios,
      body.endMonth,
    );
  }
}
