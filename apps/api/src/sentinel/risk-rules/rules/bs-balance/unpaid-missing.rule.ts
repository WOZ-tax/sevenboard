import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * A-6: 未払金の月次計上漏れ検知。
 *
 * 「過去 3 ヶ月のうち 2 ヶ月以上残高があり、当月に残高が大きく減少 (-50% 超) または 0」
 * を計上漏れの兆候として検知。
 *
 * 例: 社保・家賃・リース料などは毎月計上 → 翌月支払いで取り崩しになるため
 * 残高ゼロが連続するのは異常。
 */
@Injectable()
export class UnpaidMissingRule implements RiskRule {
  readonly key = 'UNPAID_MONTHLY_MISSING';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '未払金の月次計上漏れ (過去計上があった科目で当月減少が異常)';

  private readonly BASE_SCORE = 75;
  private readonly DROP_THRESHOLD = 0.5; // 50% 超の減少

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(transition.rows, 'unpaidExpenses');
    if (!row) return [];

    const recent = recentMonthlyValues(row, transition, ctx.month, 4);
    if (recent.length < 4) return [];

    // 直近 4 ヶ月: [当月, 前月, 前々月, 3 ヶ月前]
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
        title: `未払金が前 3 ヶ月平均から大幅減 (${formatYen(priorAvg)} → ${formatYen(current)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の未払金残高は ${formatYen(current)} で、 ` +
          `直前 3 ヶ月平均 ${formatYen(priorAvg)} から ${(dropRatio * 100).toFixed(0)}% 減少しています。 ` +
          `毎月の支払を未払計上で対応している場合 (社保・家賃・リース等)、当月の計上漏れの可能性があります。`,
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
          '当月の社会保険料・家賃・リース料などの月次計上仕訳が漏れていないか確認してください。 ' +
          '不要な支払が前倒しで実行された場合もあるため、現預金側の動きと突合する必要があります。',
      },
    ];
  }
}
