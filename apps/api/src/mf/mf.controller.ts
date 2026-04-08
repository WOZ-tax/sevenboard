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

@Controller('organizations/:orgId/mf')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class MfController {
  constructor(
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
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
    const fy = this.parseFiscalYear(fiscalYear);
    const em = this.parseMonth(endMonth);
    const [pl, bs] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId, fy, em),
      this.mfApi.getTrialBalanceBS(orgId, fy, em),
    ]);
    return this.mfTransform.buildDashboardSummary(pl, bs);
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
  ) {
    const fy = this.parseFiscalYear(fiscalYear);
    const [bsT, plT] = await Promise.all([
      this.mfApi.getTransitionBS(orgId, fy),
      this.mfApi.getTransitionPL(orgId, fy),
    ]);
    return this.mfTransform.deriveCashflow(bsT, plT);
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
}
