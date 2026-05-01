import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * A-12: 仮払金が 30 日超 (1 ヶ月以上) 残っている検知。
 *
 * 仮払金は本来精算前提の一時的な残高で、月をまたいで残っているのは異常。
 * 簡易版: 当月末の残高が 5 万円以上、かつ前月末も同水準で残っていれば滞留候補とする。
 */
@Injectable()
export class AdvanceStagnantRule implements RiskRule {
  readonly key = 'ADVANCE_STAGNANT';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '仮払金が 30 日超精算されていない';

  private readonly BASE_SCORE = 60;
  private readonly MIN_AMOUNT = 50_000;
  private readonly DRIFT_THRESHOLD = 0.2; // 大きく動いていない = 滞留

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(transition.rows, 'advancePayments');
    if (!row) return [];

    const recent = recentMonthlyValues(row, transition, ctx.month, 2);
    if (recent.length < 2) return [];

    const [current, prev] = recent.map((r) => r.value);
    if (current < this.MIN_AMOUNT || prev < this.MIN_AMOUNT) return [];

    // 月をまたいでもほぼ同水準で残っているなら滞留
    const drift = Math.abs(current - prev) / prev;
    if (drift > this.DRIFT_THRESHOLD) return [];

    const score = computeRiskScore(this.BASE_SCORE, current);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `仮払金が 1 ヶ月以上精算されずに残っています (${formatYen(current)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の仮払金残高は ${formatYen(current)} で、 ` +
          `前月末 ${formatYen(prev)} から大きく動いていません。 ` +
          `仮払金は本来短期で精算される一時勘定であり、長期化は精算手続きの停滞または科目振替漏れが疑われます。`,
        riskScore: score,
        flags: ['stagnant', 'over_30days'],
        evidence: {
          accountName: row.name,
          currentBalance: current,
          prevBalance: prev,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction:
          '仮払金の補助科目別残高を出力し、誰のいつの仮払いが残っているか確認してください。 ' +
          '使途が確定しているなら適切な経費科目に振替、未精算であれば本人に精算を依頼します。',
      },
    ];
  }
}
