import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import {
  ACCOUNT_CANDIDATES,
  findRowByCandidates,
} from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { valueAtMonth } from '../../bs-transition-helper';

/**
 * D-20: 借入金残高と返済予定 (LoanSimulation) の乖離検知。
 *
 * LoanSimulation に登録された借入の返済予定から「対象月末の予定借入残高」を計算し、
 * 実際の BS 借入金残高と比較する。
 *
 * LoanSimulation が無い (= 返済予定が登録されていない) 場合は判定保留。
 * このルールは正常な経理処理でも繰上返済 / 借換 / 新規借入で乖離するため、
 * しきい値は 5% 超 + 絶対値 50 万円超。
 */
@Injectable()
export class BorrowingDeviationRule implements RiskRule {
  readonly key = 'BORROWING_BALANCE_DEVIATION';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '借入金残高が返済予定と乖離';

  private readonly BASE_SCORE = 75;
  private readonly RATIO_THRESHOLD = 0.05; // 5% 超
  private readonly ABS_THRESHOLD = 500_000; // 50 万円超

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const loans = await ctx.prisma.loanSimulation.findMany({
      where: { tenantId: ctx.tenantId, orgId: ctx.orgId, isActive: true },
    });
    if (loans.length === 0) return []; // 返済予定が登録されていない場合は判定保留

    // 各借入の対象月末予定残高を合算
    const targetMonthEnd = new Date(Date.UTC(ctx.fiscalYear, ctx.month, 0));
    let scheduledTotal = 0;
    for (const loan of loans) {
      if (!loan.startDate) continue;
      const start = new Date(loan.startDate);
      const elapsedMonths = monthsBetween(start, targetMonthEnd);
      if (elapsedMonths < 0) continue; // 返済開始前
      const principal = Number(loan.principal);
      const monthlyRepayment = loan.monthlyRepayment
        ? Number(loan.monthlyRepayment)
        : principal / loan.termMonths; // フォールバック: 元金均等想定
      // 据置期間中は返済なし
      const repaymentMonths = Math.max(
        0,
        Math.min(elapsedMonths - loan.graceMonths, loan.termMonths),
      );
      const repaid = monthlyRepayment * repaymentMonths;
      const scheduledBalance = Math.max(0, principal - repaid);
      scheduledTotal += scheduledBalance;
    }

    // 実際の BS 残高
    const bsTransition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const shortRow = findRowByCandidates(bsTransition.rows, [...ACCOUNT_CANDIDATES.shortTermBorrowings]);
    const longRow = findRowByCandidates(bsTransition.rows, [...ACCOUNT_CANDIDATES.longTermBorrowings]);
    const shortBal = shortRow ? valueAtMonth(shortRow, bsTransition, ctx.month) ?? 0 : 0;
    const longBal = longRow ? valueAtMonth(longRow, bsTransition, ctx.month) ?? 0 : 0;
    const actualTotal = shortBal + longBal;
    if (actualTotal === 0 && scheduledTotal === 0) return [];

    const diff = actualTotal - scheduledTotal;
    const ratio = scheduledTotal > 0 ? Math.abs(diff) / scheduledTotal : 1;
    if (ratio < this.RATIO_THRESHOLD || Math.abs(diff) < this.ABS_THRESHOLD) {
      return [];
    }

    const score = computeRiskScore(this.BASE_SCORE, Math.abs(diff));
    const direction = diff > 0 ? '実残高が予定より多い' : '実残高が予定より少ない';

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `借入残高が返済予定と ${formatYen(diff)} 乖離 (${direction})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の借入残高は ${formatYen(actualTotal)}、 ` +
          `登録済の返済予定からの推定残高は ${formatYen(scheduledTotal)} で、 ` +
          `差は ${formatYen(diff)} (${(ratio * 100).toFixed(1)}%) です。 ` +
          (diff > 0
            ? '新規借入の登録漏れ、繰上返済の取り消し、または利息計上の混入が疑われます。'
            : '繰上返済が予定外に行われた、借換の登録漏れ、または借入の早期返済が疑われます。'),
        riskScore: score,
        flags: ['borrowing', diff > 0 ? 'over' : 'under'],
        evidence: {
          actualTotalBalance: actualTotal,
          scheduledTotalBalance: scheduledTotal,
          diff,
          ratioPct: Math.round(ratio * 1000) / 10,
          shortTermBalance: shortBal,
          longTermBalance: longBal,
          loanCount: loans.length,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs + loan_simulations',
        },
        recommendedAction:
          '金融機関別の返済予定表と当月末残高を突合してください。 ' +
          '新規借入・繰上返済・借換があれば LoanSimulation にも反映する必要があります。',
      },
    ];
  }
}

function monthsBetween(start: Date, end: Date): number {
  const sy = start.getUTCFullYear();
  const sm = start.getUTCMonth();
  const ey = end.getUTCFullYear();
  const em = end.getUTCMonth();
  return (ey - sy) * 12 + (em - sm);
}
