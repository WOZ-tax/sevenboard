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
 * D-21: 支払利息計上漏れ検知。
 *
 * 借入金 (短期 + 長期) に残高があるのに、当月の支払利息が 0 円のとき検知。
 * 据置期間中の借入や利息後払いの場合は誤検知になり得るため、推奨アクションで返済予定表との突合を促す。
 */
@Injectable()
export class InterestMissingRule implements RiskRule {
  readonly key = 'INTEREST_EXPENSE_MISSING';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '借入残高があるのに支払利息計上なし';

  private readonly BASE_SCORE = 70;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const [bsTransition, plTransition] = await Promise.all([
      ctx.mfApi.getTransitionBS(ctx.orgId, ctx.fiscalYear, ctx.month),
      ctx.mfApi.getTransitionPL(ctx.orgId, ctx.fiscalYear, ctx.month),
    ]);

    const shortRow = findRowByCandidates(
      bsTransition.rows,
      [...ACCOUNT_CANDIDATES.shortTermBorrowings],
    );
    const longRow = findRowByCandidates(
      bsTransition.rows,
      [...ACCOUNT_CANDIDATES.longTermBorrowings],
    );
    const shortBal = shortRow ? valueAtMonth(shortRow, bsTransition, ctx.month) ?? 0 : 0;
    const longBal = longRow ? valueAtMonth(longRow, bsTransition, ctx.month) ?? 0 : 0;
    const totalBorrowing = shortBal + longBal;
    if (totalBorrowing <= 0) return [];

    const interestRow = findRowByCandidates(
      plTransition.rows,
      [...ACCOUNT_CANDIDATES.interestExpense],
    );
    const interestThisMonth = interestRow
      ? valueAtMonth(interestRow, plTransition, ctx.month) ?? 0
      : 0;
    if (interestThisMonth > 0) return []; // 計上あり = OK

    const score = computeRiskScore(this.BASE_SCORE, totalBorrowing);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `借入残高 ${formatYen(totalBorrowing)} に対し当月の支払利息が 0 円`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の借入残高は ` +
          `短期 ${formatYen(shortBal)} + 長期 ${formatYen(longBal)} = ${formatYen(totalBorrowing)} ですが、 ` +
          `当月の支払利息が計上されていません。 ` +
          `据置期間や利息後払いの可能性もありますが、計上漏れの可能性も高いです。`,
        riskScore: score,
        flags: ['monthly_missing', 'interest'],
        evidence: {
          shortTermBorrowingBalance: shortBal,
          longTermBorrowingBalance: longBal,
          totalBorrowing,
          interestThisMonth: 0,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs + mf_transition_pl',
        },
        recommendedAction:
          '返済予定表 (利息明細) を金融機関別に確認し、当月分の利息支払または利息計上の有無を判定してください。 ' +
          '据置期間中なら本検知は無視可。計上漏れであれば月次決算前に追加計上が必要です。',
      },
    ];
  }
}
