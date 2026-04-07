import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

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
  constructor(private prisma: PrismaService) {}

  async getVarianceReport(
    orgId: string,
    query: {
      budgetVersionId: string;
      startMonth?: string;
      endMonth?: string;
    },
  ): Promise<VarianceRow[]> {
    const { budgetVersionId, startMonth, endMonth } = query;

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

    // Get the fiscal year to determine orgId scope
    const bv = await this.prisma.budgetVersion.findUnique({
      where: { id: budgetVersionId },
      include: { fiscalYear: true },
    });
    if (!bv) return [];

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

      return {
        accountId: be.accountId,
        accountCode: be.account.code,
        accountName: be.account.name,
        category: be.account.category,
        month: monthStr,
        budgetAmount: budgetAmt,
        actualAmount: actualAmt,
        varianceAmount: variance,
        variancePercent: variancePct ? Math.round(variancePct * 100) / 100 : null,
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

  async getVariableCostReport(orgId: string, month?: string) {
    // 1. Get all PL accounts with variable cost flag
    const accounts = await this.prisma.accountMaster.findMany({
      where: { orgId },
      orderBy: { displayOrder: 'asc' },
    });

    // 2. Get actual entries for the period
    const actualWhere: any = { orgId };
    if (month) {
      const monthDate = new Date(month);
      actualWhere.month = monthDate;
    }

    const entries = await this.prisma.actualEntry.findMany({
      where: actualWhere,
      include: { account: true },
    });

    // 3. Aggregate by account
    const accountTotals = new Map<string, { name: string; amount: number; isVariable: boolean; category: string }>();

    for (const entry of entries) {
      const acct = entry.account;
      const existing = accountTotals.get(acct.id);
      const amt = Number(entry.amount);
      if (existing) {
        existing.amount += amt;
      } else {
        accountTotals.set(acct.id, {
          name: acct.name,
          amount: amt,
          isVariable: acct.isVariableCost,
          category: acct.category,
        });
      }
    }

    // 4. Separate revenue, variable costs, fixed costs
    const revenueCategories = new Set(['REVENUE']);
    const costCategories = new Set([
      'COST_OF_SALES',
      'SELLING_EXPENSE',
      'ADMIN_EXPENSE',
    ]);

    let revenue = 0;
    const variableCosts: { name: string; amount: number }[] = [];
    const fixedCosts: { name: string; amount: number }[] = [];

    for (const [, data] of accountTotals) {
      if (revenueCategories.has(data.category)) {
        revenue += data.amount;
      } else if (costCategories.has(data.category)) {
        if (data.isVariable) {
          variableCosts.push({ name: data.name, amount: data.amount });
        } else {
          fixedCosts.push({ name: data.name, amount: data.amount });
        }
      }
    }

    // 5. Compute KPIs
    const totalVariableCost = variableCosts.reduce((s, c) => s + c.amount, 0);
    const totalFixedCost = fixedCosts.reduce((s, c) => s + c.amount, 0);
    const marginalProfit = revenue - totalVariableCost;
    const marginalProfitRatio = revenue > 0 ? marginalProfit / revenue : 0;
    const breakEvenPoint = marginalProfitRatio > 0 ? totalFixedCost / marginalProfitRatio : 0;
    const safetyMargin = revenue > 0 ? ((revenue - breakEvenPoint) / revenue) * 100 : 0;

    return {
      revenue,
      variableCosts,
      fixedCosts,
      totalVariableCost,
      totalFixedCost,
      marginalProfit,
      marginalProfitRatio: Math.round(marginalProfitRatio * 10000) / 100, // percent
      breakEvenPoint: Math.round(breakEvenPoint),
      safetyMargin: Math.round(safetyMargin * 10) / 10,
    };
  }
}
