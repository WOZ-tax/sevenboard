import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * A-8: 未払費用の月次計上漏れ検知。
 *
 * 未払費用は経過勘定 (給与・社保・利息など、毎月発生するが支払期日が翌月以降) で、
 * 月次計上で残高が動くのが正常。前 3 ヶ月平均から大きく減少 → 計上漏れの可能性。
 */
@Injectable()
export class AccruedMissingRule implements RiskRule {
  readonly key = 'ACCRUED_MONTHLY_MISSING';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '未払費用の月次計上漏れ';

  private readonly BASE_SCORE = 75;
  private readonly DROP_THRESHOLD = 0.5;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(transition.rows, 'accruedExpenses');
    if (!row) return [];

    const recent = recentMonthlyValues(row, transition, ctx.month, 4);
    if (recent.length < 4) return [];

    const [current, m1, m2, m3] = recent.map((r) => r.value);
    const priorAvg = (m1 + m2 + m3) / 3;
    if (priorAvg <= 0) return [];

    const dropRatio = (priorAvg - current) / priorAvg;
    if (dropRatio < this.DROP_THRESHOLD) return [];

    const drop = priorAvg - current;
    const score = computeRiskScore(this.BASE_SCORE, drop);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `未払費用が前 3 ヶ月平均から大幅減 (${formatYen(priorAvg)} → ${formatYen(current)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の未払費用は ${formatYen(current)} で、 ` +
          `直前 3 ヶ月平均 ${formatYen(priorAvg)} から ${(dropRatio * 100).toFixed(0)}% 減少しています。 ` +
          `経過勘定として給与・社保・利息などの月次計上が必要な科目の漏れが疑われます。`,
        riskScore: score,
        flags: ['monthly_drop', 'possible_missing'],
        evidence: {
          accountName: row.name,
          currentBalance: current,
          priorAverage: priorAvg,
          dropPct: Math.round(dropRatio * 100),
          monthlyBalances: recent,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction:
          '給与計算済みの月次給与・社会保険料・支払利息などの未払計上仕訳が当月入っているか確認してください。 ' +
          '計上漏れであれば月次決算前に追加計上が必要です。',
      },
    ];
  }
}
