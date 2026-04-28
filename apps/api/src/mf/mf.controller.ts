import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { MfApiService } from './mf-api.service';
import { MfTransformService } from './mf-transform.service';
import { ReviewService } from './review.service';
import { MonthlyCloseService } from '../monthly-close/monthly-close.service';

@Controller('organizations/:orgId/mf')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class MfController {
  constructor(
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    private reviewService: ReviewService,
    private monthlyCloseService: MonthlyCloseService,
  ) {}

  private parseFiscalYear(value?: string): number | undefined {
    if (!value) return undefined;
    const fy = parseInt(value, 10);
    if (isNaN(fy) || fy < 1900 || fy > 2100) {
      throw new BadRequestException('Invalid fiscal year');
    }
    return fy;
  }

  private parseMonth(value?: string): number | undefined {
    if (!value) return undefined;
    const m = parseInt(value, 10);
    if (isNaN(m) || m < 1 || m > 12) {
      throw new BadRequestException('Invalid month (1-12)');
    }
    return m;
  }

  @Get('office')
  async getOffice(@Param('orgId') orgId: string) {
    return this.mfApi.getOffice(orgId);
  }

  @Get('dashboard')
  async getDashboard(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    // 注: dashboard サマリーは Net Burn 基準で固定（主指標）。runway モードは UI 切替で variants から選ぶ。
    const fy = this.parseFiscalYear(fiscalYear);
    const em = this.parseMonth(endMonth);
    const prevFy = fy ? fy - 1 : undefined;
    const [pl, bs, bsT, plT, settledMonths, prevPl, prevBs] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId, fy, em),
      this.mfApi.getTrialBalanceBS(orgId, fy, em),
      this.mfApi.getTransitionBS(orgId, fy, em).catch(() => null),
      this.mfApi.getTransitionPL(orgId, fy, em).catch(() => null),
      fy ? this.monthlyCloseService.getSettledMonths(orgId, fy) : Promise.resolve(undefined),
      // 前年同期（YoY 比較用）。失敗しても dashboard 全体は壊さない
      prevFy
        ? this.mfApi.getTrialBalancePL(orgId, prevFy, em).catch(() => null)
        : Promise.resolve(null),
      prevFy
        ? this.mfApi.getTrialBalanceBS(orgId, prevFy, em).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (!pl?.rows || !bs?.rows) {
      throw new BadRequestException('MF returned empty trial balance data');
    }
    const cashflowDerived =
      bsT && plT
        ? this.mfTransform.deriveCashflow(bsT, plT, bs, settledMonths, {
            trustEndMonth: !!em,
          })
        : undefined;
    return this.mfTransform.buildDashboardSummary(
      pl,
      bs,
      cashflowDerived,
      prevPl,
      prevBs,
    );
  }

  @Get('financial-statements/pl')
  async getPL(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const em = this.parseMonth(endMonth);
    const priorFy = fy ? fy - 1 : undefined;
    const [data, priorData] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId, fy, em),
      priorFy
        ? this.mfApi.getTrialBalancePL(orgId, priorFy, em).catch(() => null)
        : Promise.resolve(null),
    ]);
    return this.mfTransform.transformTrialBalancePL(data, priorData);
  }

  @Get('financial-statements/bs')
  async getBS(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const em = this.parseMonth(endMonth);
    const priorFy = fy ? fy - 1 : undefined;
    const [data, priorData] = await Promise.all([
      this.mfApi.getTrialBalanceBS(orgId, fy, em),
      priorFy
        ? this.mfApi.getTrialBalanceBS(orgId, priorFy, em).catch(() => null)
        : Promise.resolve(null),
    ]);
    return this.mfTransform.transformTrialBalanceBS(data, priorData);
  }

  @Get('cashflow')
  async getCashflow(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const em = this.parseMonth(endMonth);
    // 期首残高（前月繰越の初月）を確実に拾うため、BS試算表を先に取得してから推移表を並列取得
    // .catch(()=>null) で握りつぶすと priorCash=0 にデグレるので、失敗時はエラーを返す
    // ダッシュボードと整合させるため endMonth フィルタを下流に伝搬する。
    const bsTrial = await this.mfApi.getTrialBalanceBS(orgId, fy, em);
    const [bsT, plT, settledMonths] = await Promise.all([
      this.mfApi.getTransitionBS(orgId, fy, em),
      this.mfApi.getTransitionPL(orgId, fy, em),
      fy ? this.monthlyCloseService.getSettledMonths(orgId, fy) : Promise.resolve(undefined),
    ]);
    return this.mfTransform.deriveCashflow(bsT, plT, bsTrial, settledMonths, {
      trustEndMonth: !!em,
    });
  }

  @Get('pl-transition')
  async getPLTransition(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const data = await this.mfApi.getTransitionPL(orgId, fy);
    return this.mfTransform.transformTransitionPL(data);
  }

  @Get('accounts')
  async getAccounts(@Param('orgId') orgId: string) {
    return this.mfApi.getAccounts(orgId);
  }

  @Get('accounts/:accountName/transition')
  async getAccountTransition(
    @Param('orgId') orgId: string,
    @Param('accountName') accountName: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const [plT, bsT] = await Promise.all([
      this.mfApi.getTransitionPL(orgId, fy),
      this.mfApi.getTransitionBS(orgId, fy),
    ]);
    const decoded = decodeURIComponent(accountName);
    const plResult = this.mfTransform.getAccountTransition(plT, decoded);
    const hasData = plResult.some((r) => r.amount !== 0);
    if (hasData) return plResult;
    return this.mfTransform.getAccountTransition(bsT, decoded);
  }

  @Get('journals')
  async getJournals(
    @Param('orgId') orgId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('accountName') accountName?: string,
  ) {
    const data = await this.mfApi.getJournals(orgId, { startDate, endDate });
    if (!accountName) return data;
    const decoded = decodeURIComponent(accountName);
    if (data?.journals) {
      data.journals = data.journals.filter(
        (j: any) =>
          j.branches?.some(
            (b: any) =>
              b.debitor?.account_name?.includes(decoded) ||
              b.creditor?.account_name?.includes(decoded),
          ),
      );
    }
    return data;
  }

  @Get('financial-indicators')
  async getFinancialIndicators(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const em = this.parseMonth(endMonth);
    const [pl, bs] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId, fy, em),
      this.mfApi.getTrialBalanceBS(orgId, fy, em),
    ]);
    return this.mfTransform.calculateFinancialIndicators(pl, bs);
  }

  @Get('predictions')
  async getPredictions(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('months') months?: string,
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const data = await this.mfApi.getTransitionPL(orgId, fy);
    return this.mfTransform.predictTrend(
      data,
      months ? parseInt(months, 10) : 3,
    );
  }

  @Get('review')
  async runReview(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('month') month?: string,
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const parsedMonth = month ? parseInt(month, 10) : undefined;
    const targetMonth =
      parsedMonth && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth
        : undefined;
    return this.reviewService.runReview(orgId, fy, targetMonth);
  }
}
