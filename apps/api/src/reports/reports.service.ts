import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { MfApiService } from '../mf/mf-api.service';
import { MfReportRow, TB_COL } from '../mf/types/mf-api.types';

export interface VarianceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  category: string;
  month: string;
  budgetAmount: number;
  actualAmount: number;
  varianceAmount: number;
  variancePercent: number | null;
  priorYearAmount: number | null;
}

export interface PlRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  category: string;
  months: Record<string, number>; // "2026-04": 1234567
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
  ) {}

  async getVarianceReport(
    orgId: string,
    query: {
      budgetVersionId: string;
      startMonth?: string;
      endMonth?: string;
    },
  ): Promise<VarianceRow[]> {
    const { budgetVersionId, startMonth, endMonth } = query;

    // IDOR 対策: budgetVersionId が route の orgId と同じ org に属することを必ず検証。
    // OrgAccessGuard が orgId への access は保証しているが、別 org の bvId が渡されても
    // org-bv の親子関係を確認しない限り、別 org の予算明細が漏れる。
    const bv = await this.prisma.budgetVersion.findUnique({
      where: { id: budgetVersionId },
      include: { fiscalYear: { select: { orgId: true } } },
    });
    if (!bv) {
      throw new NotFoundException('Budget version not found');
    }
    if (bv.fiscalYear.orgId !== orgId) {
      throw new ForbiddenException(
        '指定された budgetVersionId はこの組織に属していません',
      );
    }

    // Get budget entries
    const budgetWhere: any = { budgetVersionId };
    if (startMonth) {
      budgetWhere.month = { ...(budgetWhere.month || {}), gte: new Date(startMonth) };
    }
    if (endMonth) {
      budgetWhere.month = { ...(budgetWhere.month || {}), lte: new Date(endMonth) };
    }

    const budgetEntries = await this.prisma.budgetEntry.findMany({
      where: budgetWhere,
      include: {
        account: true,
      },
    });

    // Get actual entries for the same period
    const actualWhere: any = { orgId };
    if (startMonth) {
      actualWhere.month = { ...(actualWhere.month || {}), gte: new Date(startMonth) };
    }
    if (endMonth) {
      actualWhere.month = { ...(actualWhere.month || {}), lte: new Date(endMonth) };
    }

    const actualEntries = await this.prisma.actualEntry.findMany({
      where: actualWhere,
      include: {
        account: true,
      },
    });

    // Build a map of actuals by accountId+month
    const actualMap = new Map<string, Decimal>();
    for (const ae of actualEntries) {
      const key = `${ae.accountId}:${ae.month.toISOString().slice(0, 10)}`;
      actualMap.set(key, ae.amount);
    }

    // 前年同月の実績を取得（予算期間を12ヶ月シフト）
    const budgetMonths = budgetEntries.map((be) => be.month);
    const priorYearMap = new Map<string, Decimal>();
    if (budgetMonths.length > 0) {
      const minMonth = new Date(Math.min(...budgetMonths.map((m) => m.getTime())));
      const maxMonth = new Date(Math.max(...budgetMonths.map((m) => m.getTime())));
      const priorMin = new Date(Date.UTC(minMonth.getUTCFullYear() - 1, minMonth.getUTCMonth(), 1));
      const priorMax = new Date(Date.UTC(maxMonth.getUTCFullYear() - 1, maxMonth.getUTCMonth(), 1));
      const priorActuals = await this.prisma.actualEntry.findMany({
        where: {
          orgId,
          month: { gte: priorMin, lte: priorMax },
        },
      });
      for (const ae of priorActuals) {
        // 前年月 → 当年月にキー化
        const shiftedMonth = new Date(Date.UTC(ae.month.getUTCFullYear() + 1, ae.month.getUTCMonth(), 1));
        const key = `${ae.accountId}:${shiftedMonth.toISOString().slice(0, 10)}`;
        priorYearMap.set(key, ae.amount);
      }
    }

    // 収益科目: 実績>予算が良好（プラス表示）
    // 費用科目: 実績<予算が良好（プラス表示）
    const revenueCategories = new Set([
      'REVENUE',
      'NON_OPERATING_INCOME',
      'EXTRAORDINARY_INCOME',
    ]);

    // Compute variance for each budget entry
    const result: VarianceRow[] = budgetEntries.map((be) => {
      const monthStr = be.month.toISOString().slice(0, 10);
      const key = `${be.accountId}:${monthStr}`;
      const budgetAmt = Number(be.amount);
      const actualAmt = Number(actualMap.get(key) || 0);

      // 収益科目: actual - budget（実績が予算を上回ればプラス）
      // 費用科目: budget - actual（実績が予算を下回ればプラス）
      const isRevenue = revenueCategories.has(be.account.category);
      const variance = isRevenue ? actualAmt - budgetAmt : budgetAmt - actualAmt;
      const variancePct = budgetAmt !== 0 ? (variance / budgetAmt) * 100 : null;

      const priorYearRaw = priorYearMap.get(key);
      const priorYearAmount =
        priorYearRaw !== undefined ? Number(priorYearRaw) : null;

      return {
        accountId: be.accountId,
        accountCode: be.account.code,
        accountName: be.account.name,
        category: be.account.category,
        month: monthStr,
        budgetAmount: budgetAmt,
        actualAmount: actualAmt,
        varianceAmount: variance,
        variancePercent:
          variancePct !== null ? Math.round(variancePct * 100) / 100 : null,
        priorYearAmount,
      };
    });

    return result;
  }

  async getPlReport(
    orgId: string,
    query: { startMonth?: string; endMonth?: string },
  ): Promise<PlRow[]> {
    const where: any = { orgId };
    if (query.startMonth) {
      where.month = { ...(where.month || {}), gte: new Date(query.startMonth) };
    }
    if (query.endMonth) {
      where.month = { ...(where.month || {}), lte: new Date(query.endMonth) };
    }

    const entries = await this.prisma.actualEntry.findMany({
      where,
      include: {
        account: true,
      },
      orderBy: [{ account: { displayOrder: 'asc' } }, { month: 'asc' }],
    });

    // PL categories only
    const plCategories = new Set([
      'REVENUE',
      'COST_OF_SALES',
      'SELLING_EXPENSE',
      'ADMIN_EXPENSE',
      'NON_OPERATING_INCOME',
      'NON_OPERATING_EXPENSE',
      'EXTRAORDINARY_INCOME',
      'EXTRAORDINARY_EXPENSE',
    ]);

    // Group by account, aggregate by month
    const accountMap = new Map<string, PlRow>();

    for (const entry of entries) {
      if (!plCategories.has(entry.account.category)) continue;

      const monthStr = entry.month.toISOString().slice(0, 7); // "2026-04"

      if (!accountMap.has(entry.accountId)) {
        accountMap.set(entry.accountId, {
          accountId: entry.accountId,
          accountCode: entry.account.code,
          accountName: entry.account.name,
          category: entry.account.category,
          months: {},
        });
      }

      const row = accountMap.get(entry.accountId)!;
      row.months[monthStr] = (row.months[monthStr] || 0) + Number(entry.amount);
    }

    return Array.from(accountMap.values());
  }

  async getVariableCostReport(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ) {
    const pl = await this.mfApi.getTrialBalancePL(orgId, fiscalYear, endMonth);

    const overrides = await this.prisma.accountMaster.findMany({
      where: { orgId },
      select: { name: true, isVariableCost: true },
    });
    const overrideMap = new Map(overrides.map((a) => [a.name, a.isVariableCost]));

    const revenueRoot = this.findRow(pl.rows, '売上高合計');
    const cogsRoot = this.findRow(pl.rows, '売上原価');
    const sgaRoot = this.findRow(pl.rows, '販売費及び一般管理費合計');

    const revenue = revenueRoot ? this.val(revenueRoot, TB_COL.CLOSING) : 0;

    const cogsLeaves = cogsRoot ? this.collectLeaves(cogsRoot) : [];
    const sgaLeaves = sgaRoot ? this.collectLeaves(sgaRoot) : [];

    const variableCosts: { name: string; amount: number }[] = [];
    const fixedCosts: { name: string; amount: number }[] = [];

    for (const leaf of cogsLeaves) {
      const amount = this.val(leaf, TB_COL.CLOSING);
      if (amount === 0) continue;
      const override = overrideMap.get(leaf.name);
      const isVariable = override !== undefined ? override : true;
      (isVariable ? variableCosts : fixedCosts).push({ name: leaf.name, amount });
    }

    for (const leaf of sgaLeaves) {
      const amount = this.val(leaf, TB_COL.CLOSING);
      if (amount === 0) continue;
      const override = overrideMap.get(leaf.name);
      const isVariable =
        override !== undefined ? override : this.isVariableByName(leaf.name);
      (isVariable ? variableCosts : fixedCosts).push({ name: leaf.name, amount });
    }

    const totalVariableCost = variableCosts.reduce((s, c) => s + c.amount, 0);
    const totalFixedCost = fixedCosts.reduce((s, c) => s + c.amount, 0);
    const marginalProfit = revenue - totalVariableCost;
    const marginalProfitRatio = revenue > 0 ? marginalProfit / revenue : 0;
    const breakEvenPoint =
      marginalProfitRatio > 0 ? totalFixedCost / marginalProfitRatio : 0;
    const safetyMargin =
      revenue > 0 ? ((revenue - breakEvenPoint) / revenue) * 100 : 0;

    return {
      revenue,
      variableCosts,
      fixedCosts,
      totalVariableCost,
      totalFixedCost,
      marginalProfit,
      marginalProfitRatio: Math.round(marginalProfitRatio * 10000) / 100,
      breakEvenPoint: Math.round(breakEvenPoint),
      safetyMargin: Math.round(safetyMargin * 10) / 10,
    };
  }

  private findRow(rows: MfReportRow[], name: string): MfReportRow | null {
    for (const row of rows) {
      if (row.name === name) return row;
      if (row.rows) {
        const found = this.findRow(row.rows, name);
        if (found) return found;
      }
    }
    return null;
  }

  private collectLeaves(row: MfReportRow): MfReportRow[] {
    if (!row.rows || row.rows.length === 0) {
      return row.type === 'account' ? [row] : [];
    }
    const leaves: MfReportRow[] = [];
    for (const child of row.rows) {
      leaves.push(...this.collectLeaves(child));
    }
    return leaves;
  }

  private val(row: MfReportRow, col: number): number {
    return Number(row.values?.[col] ?? 0);
  }

  // 販管費のデフォルト変動/固定判定（AccountMaster未設定時のフォールバック）
  private isVariableByName(name: string): boolean {
    const variableKeywords = [
      '販売手数料',
      '支払手数料',
      '外注',
      '荷造',
      '運賃',
      '発送',
      '仕入',
      '材料',
      '商品',
      '製品',
      '販売促進',
    ];
    return variableKeywords.some((k) => name.includes(k));
  }
}
