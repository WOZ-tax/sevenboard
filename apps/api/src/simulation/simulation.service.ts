import { Injectable, Logger } from '@nestjs/common';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { TB_COL } from '../mf/types/mf-api.types';
import { LoanSimulationDto } from './dto/loan-simulation.dto';
import { LinkedStatementsDto } from './dto/linked-statements.dto';
import { WhatIfDto } from './dto/what-if.dto';

export interface LoanScheduleEntry {
  month: number;
  principal: number;
  interest: number;
  payment: number;
  balance: number;
}

export interface LoanSimulationResult {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  schedule: LoanScheduleEntry[];
  runwayImpact?: {
    currentCash: number;
    monthlyPaymentBurden: number;
    adjustedRunwayMonths: number;
  };
}

@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);

  constructor(
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
  ) {}

  // =========================================
  // 融資シミュレーション
  // =========================================
  async loanSimulation(
    orgId: string,
    dto: LoanSimulationDto,
  ): Promise<LoanSimulationResult> {
    const { principal, interestRate, termMonths, repaymentType } = dto;
    const graceMonths = dto.graceMonths || 0;
    const monthlyRate = interestRate / 100 / 12;
    const repaymentMonths = termMonths - graceMonths;

    const schedule: LoanScheduleEntry[] = [];
    let balance = principal;
    let totalPayment = 0;
    let totalInterest = 0;
    let firstRepaymentPayment = 0;

    // 据置期間（利息のみ）
    for (let m = 1; m <= graceMonths; m++) {
      const interest = Math.round(balance * monthlyRate);
      const payment = interest;
      totalPayment += payment;
      totalInterest += interest;
      schedule.push({
        month: m,
        principal: 0,
        interest,
        payment,
        balance,
      });
    }

    if (repaymentType === 'EQUAL_INSTALLMENT') {
      // 元利均等: P * r(1+r)^n / ((1+r)^n - 1)
      const r = monthlyRate;
      const n = repaymentMonths;
      const monthlyPayment =
        r === 0
          ? Math.round(principal / n)
          : Math.round(
              (principal * r * Math.pow(1 + r, n)) /
                (Math.pow(1 + r, n) - 1),
            );
      firstRepaymentPayment = monthlyPayment;

      for (let m = graceMonths + 1; m <= termMonths; m++) {
        const interest = Math.round(balance * monthlyRate);
        const principalPart = monthlyPayment - interest;
        balance = Math.max(0, balance - principalPart);
        totalPayment += monthlyPayment;
        totalInterest += interest;
        schedule.push({
          month: m,
          principal: principalPart,
          interest,
          payment: monthlyPayment,
          balance: Math.round(balance),
        });
      }
    } else if (repaymentType === 'EQUAL_PRINCIPAL') {
      // 元金均等: 元金部分固定 + 利息逓減
      const monthlyPrincipal = Math.round(principal / repaymentMonths);
      firstRepaymentPayment =
        monthlyPrincipal + Math.round(balance * monthlyRate);

      for (let m = graceMonths + 1; m <= termMonths; m++) {
        const interest = Math.round(balance * monthlyRate);
        const isLast = m === termMonths;
        const principalPart = isLast
          ? Math.round(balance)
          : monthlyPrincipal;
        const payment = principalPart + interest;
        balance = Math.max(0, balance - principalPart);
        totalPayment += payment;
        totalInterest += interest;
        schedule.push({
          month: m,
          principal: principalPart,
          interest,
          payment,
          balance: Math.round(balance),
        });
      }
    } else {
      // BULLET: 利息のみ月次、満期に元金一括
      firstRepaymentPayment = Math.round(balance * monthlyRate);

      for (let m = graceMonths + 1; m <= termMonths; m++) {
        const interest = Math.round(balance * monthlyRate);
        const isLast = m === termMonths;
        const principalPart = isLast ? Math.round(balance) : 0;
        const payment = principalPart + interest;
        if (isLast) balance = 0;
        totalPayment += payment;
        totalInterest += interest;
        schedule.push({
          month: m,
          principal: principalPart,
          interest,
          payment,
          balance: Math.round(balance),
        });
      }
    }

    // BS現預金からランウェイ影響を計算
    let runwayImpact: LoanSimulationResult['runwayImpact'];
    try {
      const [pl, bs] = await Promise.all([
        this.mfApi.getTrialBalancePL(orgId),
        this.mfApi.getTrialBalanceBS(orgId),
      ]);
      const dashboard = this.mfTransform.buildDashboardSummary(pl, bs);
      const currentCash = dashboard.cashBalance;
      const monthlyBurn = dashboard.runway < 999 ? currentCash / dashboard.runway : 0;
      const monthlyPaymentBurden = firstRepaymentPayment;
      const adjustedBurn = monthlyBurn + monthlyPaymentBurden;
      const adjustedRunwayMonths =
        adjustedBurn > 0
          ? Math.round(((currentCash + principal) / adjustedBurn) * 10) / 10
          : 999;

      runwayImpact = {
        currentCash,
        monthlyPaymentBurden,
        adjustedRunwayMonths,
      };
    } catch (err) {
      this.logger.warn('Could not compute runway impact', err);
    }

    return {
      monthlyPayment: firstRepaymentPayment,
      totalPayment,
      totalInterest,
      schedule,
      runwayImpact,
    };
  }

  // =========================================
  // 財務三表連動シミュレーション
  // =========================================
  async linkedStatements(orgId: string, dto: LinkedStatementsDto) {
    const [plData, bsData] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId),
      this.mfApi.getTrialBalanceBS(orgId),
    ]);

    const plRows = this.mfTransform.transformTrialBalancePL(plData);
    const bsResult = this.mfTransform.transformTrialBalanceBS(bsData);
    const dashboard = this.mfTransform.buildDashboardSummary(plData, bsData);

    // 元のPL値
    const origRevenue = dashboard.revenue;
    const findPlRow = (label: string) =>
      plRows.find((r) => r.category === label);
    const origCogs =
      findPlRow('売上原価')?.current || 0;
    const origSga =
      findPlRow('販売費及び一般管理費')?.current || 0;
    const origOpProfit = dashboard.operatingProfit;
    const origNetIncome = dashboard.netIncome;

    // 上書き適用
    const newRevenue =
      dto.revenueOverride !== undefined ? dto.revenueOverride : origRevenue;
    const newCogs =
      dto.cogsOverride !== undefined ? dto.cogsOverride : origCogs;
    const newSga =
      dto.sgaOverride !== undefined ? dto.sgaOverride : origSga;

    const newGrossProfit = newRevenue - newCogs;
    const newOpProfit = newGrossProfit - newSga;

    // 営業外・特別損益はそのまま
    const nonOpIncome = findPlRow('営業外収益')?.current || 0;
    const nonOpExpense = findPlRow('営業外費用')?.current || 0;
    const extraIncome = findPlRow('特別利益')?.current || 0;
    const extraExpense = findPlRow('特別損失')?.current || 0;
    const tax = findPlRow('法人税等')?.current || 0;

    const newOrdinaryProfit = newOpProfit + nonOpIncome - nonOpExpense;
    const newPreTaxProfit =
      newOrdinaryProfit + extraIncome - extraExpense;
    const newNetIncome = newPreTaxProfit - tax;

    // PL行の再構築
    const simulatedPl = [
      { category: '売上高', current: newRevenue, prior: origRevenue },
      { category: '売上原価', current: newCogs, prior: origCogs },
      {
        category: '売上総利益',
        current: newGrossProfit,
        prior: origRevenue - origCogs,
        isTotal: true,
      },
      { category: '販売費及び一般管理費', current: newSga, prior: origSga },
      {
        category: '営業利益',
        current: newOpProfit,
        prior: origOpProfit,
        isTotal: true,
      },
      { category: '営業外収益', current: nonOpIncome, prior: nonOpIncome },
      { category: '営業外費用', current: nonOpExpense, prior: nonOpExpense },
      {
        category: '経常利益',
        current: newOrdinaryProfit,
        prior: dashboard.ordinaryProfit,
        isTotal: true,
      },
      { category: '特別利益', current: extraIncome, prior: extraIncome },
      { category: '特別損失', current: extraExpense, prior: extraExpense },
      { category: '法人税等', current: tax, prior: tax },
      {
        category: '当期純利益',
        current: newNetIncome,
        prior: origNetIncome,
        isTotal: true,
      },
    ];

    // BS影響: 利益変動分 → 繰越利益剰余金に反映、現預金に反映
    const profitDiff = newNetIncome - origNetIncome;

    const adjustBsRows = (
      rows: { category: string; current: number; prior: number; isTotal?: boolean; isHeader?: boolean }[],
    ) =>
      rows.map((row) => {
        const cat = row.category.trim();
        if (cat === '現預金' || cat === '現金及び預金' || cat.includes('現預金')) {
          return { ...row, current: row.current + profitDiff };
        }
        if (cat === '流動資産合計' || cat === '資産合計') {
          return { ...row, current: row.current + profitDiff };
        }
        if (cat === '利益剰余金' || cat.includes('利益剰余金')) {
          return { ...row, current: row.current + profitDiff };
        }
        if (
          cat === '純資産合計' ||
          cat === '負債純資産合計'
        ) {
          return { ...row, current: row.current + profitDiff };
        }
        return row;
      });

    const simulatedBs = {
      assets: adjustBsRows(bsResult.assets),
      liabilitiesEquity: adjustBsRows(bsResult.liabilitiesEquity),
    };

    // CF影響
    const simulatedCf = [
      {
        category: '営業活動によるキャッシュフロー',
        current: profitDiff + origNetIncome,
        prior: origNetIncome,
        isTotal: true,
      },
      {
        category: '投資活動によるキャッシュフロー',
        current: 0,
        prior: 0,
        isTotal: true,
      },
      {
        category: '財務活動によるキャッシュフロー',
        current: 0,
        prior: 0,
        isTotal: true,
      },
      {
        category: '現預金増減額',
        current: profitDiff,
        prior: 0,
        isTotal: true,
      },
    ];

    return {
      pl: simulatedPl,
      bs: simulatedBs,
      cf: simulatedCf,
      summary: {
        beforeProfit: origNetIncome,
        afterProfit: newNetIncome,
        profitImpact: profitDiff,
        cashImpact: profitDiff,
      },
    };
  }

  // =========================================
  // What-if シミュレーション
  // =========================================
  async whatIf(orgId: string, dto: WhatIfDto, fiscalYear?: number) {
    const [pl, bs, plT, bsT] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId, fiscalYear),
      this.mfApi.getTrialBalanceBS(orgId, fiscalYear),
      this.mfApi.getTransitionPL(orgId, fiscalYear),
      this.mfApi.getTransitionBS(orgId, fiscalYear),
    ]);

    const findRow = (rows: any[], name: string): any => {
      for (const row of rows) {
        if (row.name === name) return row;
        if (row.name?.includes(name)) return row;
        if (row.rows) {
          const found = findRow(row.rows, name);
          if (found) return found;
        }
      }
      return null;
    };

    const val = (row: any, colIdx: number): number => {
      if (!row) return 0;
      return (row.values?.[colIdx] as number) || 0;
    };

    // Current values
    const revenue = val(findRow(pl.rows, '売上高合計'), TB_COL.CLOSING);
    const opProfitRow = findRow(pl.rows, '営業利益') || findRow(pl.rows, '営業損失');
    const operatingProfit = val(opProfitRow, TB_COL.CLOSING);
    const sgaTotal = val(findRow(pl.rows, '販売費及び一般管理費合計'), TB_COL.CLOSING);
    const cogs = val(findRow(pl.rows, '売上原価'), TB_COL.CLOSING);
    const totalExpense = sgaTotal + cogs;

    // 人件費
    const PAYROLL_ACCTS = ['役員報酬', '給料賃金', '賞与', '雑給', '退職給与', '法定福利費', '福利厚生費'];
    const sgaRow = findRow(pl.rows, '販売費及び一般管理費');
    let payrollCost = 0;
    if (sgaRow?.rows) {
      for (const child of sgaRow.rows) {
        if (PAYROLL_ACCTS.includes(child.name)) {
          payrollCost += val(child, TB_COL.CLOSING);
        }
      }
    }

    // 現預金
    const cashRow = findRow(bs.rows, '現金及び預金');
    const cashBalance = val(cashRow, TB_COL.CLOSING);

    // 現在のランウェイ
    const cashflow = this.mfTransform.deriveCashflow(bsT, plT);
    const currentRunway = cashflow.runway.months;

    // --- シミュレーション計算 ---
    const revenueChangePct = (dto.revenueChangePercent || 0) / 100;
    const costChangePct = (dto.costChangePercent || 0) / 100;
    const newHires = dto.newHires || 0;
    const additionalInvestment = dto.additionalInvestment || 0;

    // 一人あたり人件費推定
    const estimatedHeadcount = payrollCost > 0 ? Math.max(Math.round(payrollCost / 6_000_000), 1) : 1;
    const avgPayrollPerPerson = payrollCost > 0 ? payrollCost / estimatedHeadcount : 6_000_000;

    const newRevenue = revenue * (1 + revenueChangePct);
    const newCogs = cogs * (1 + costChangePct);
    const newSga = sgaTotal * (1 + costChangePct) + (avgPayrollPerPerson * newHires);
    const newTotalExpense = newCogs + newSga;
    const newOperatingProfit = newRevenue - newTotalExpense;
    const newPayrollCost = payrollCost + (avgPayrollPerPerson * newHires);

    const profitChange = newOperatingProfit - operatingProfit;
    const cashChange = profitChange - additionalInvestment;
    const newCashBalance = cashBalance + cashChange;

    const monthlyExpense = newTotalExpense / 12;
    const newRunway = monthlyExpense > 0
      ? Math.round((Math.max(0, newCashBalance) / monthlyExpense) * 10) / 10
      : 999;

    return {
      before: {
        revenue,
        operatingProfit,
        cashBalance,
        runway: currentRunway,
        payrollCost,
        totalExpense,
      },
      after: {
        revenue: Math.round(newRevenue),
        operatingProfit: Math.round(newOperatingProfit),
        cashBalance: Math.round(newCashBalance),
        runway: newRunway,
        payrollCost: Math.round(newPayrollCost),
        totalExpense: Math.round(newTotalExpense),
      },
      impact: {
        revenueChange: Math.round(newRevenue - revenue),
        profitChange: Math.round(profitChange),
        cashChange: Math.round(cashChange),
        runwayChange: Math.round((newRunway - currentRunway) * 10) / 10,
      },
    };
  }
}
