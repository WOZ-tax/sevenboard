import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * E-22: 仮払消費税の計上漏れ検知。
 *
 * 課税事業者で税抜経理を採用している場合、毎月の経費取引に応じて仮払消費税が動くはず。
 * 過去 3 ヶ月計上があり、当月ゼロ → 計上漏れの可能性。
 *
 * 税込経理の会社では仮払消費税科目を使わないため、過去 3 ヶ月もゼロなら判定対象外。
 */
@Injectable()
export class ConsumptionTaxAdvanceMissingRule implements RiskRule {
  readonly key = 'CONSUMPTION_TAX_ADVANCE_MISSING';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '仮払消費税の月次計上漏れ';

  private readonly BASE_SCORE = 70;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(transition.rows, 'consumptionTaxAdvance');
    if (!row) return [];

    const recent = recentMonthlyValues(row, transition, ctx.month, 4);
    if (recent.length < 4) return [];

    const [current, m1, m2, m3] = recent.map((r) => r.value);
    if (current !== 0) return []; // 当月計上あり = OK

    const priorOccurrences = [m1, m2, m3].filter((v) => v !== 0).length;
    if (priorOccurrences === 0) return []; // 税込経理の可能性 → 判定対象外

    const monthlyAvg = ([m1, m2, m3].reduce((a, b) => a + b, 0)) / Math.max(priorOccurrences, 1);
    const score = computeRiskScore(this.BASE_SCORE, Math.abs(monthlyAvg));

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `仮払消費税の当月残高が 0 円 (前 3 ヶ月平均 ${formatYen(monthlyAvg)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の仮払消費税残高がゼロですが、 ` +
          `直前 3 ヶ月では推移があります。税抜経理を採用している場合、 ` +
          `経費仕訳の課税区分が漏れている可能性があります。`,
        riskScore: score,
        flags: ['consumption_tax', 'monthly_missing'],
        evidence: {
          accountName: row.name,
          currentBalance: 0,
          priorMonthlyAverage: monthlyAvg,
          recentMonthly: recent,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction:
          '当月の経費仕訳の課税区分を確認してください。 ' +
          '税込経理に切替えていない限り、課税仕入の仕訳には消費税区分が必要です。 ' +
          '科目別の課税区分マスター設定の見直しも検討してください。',
      },
    ];
  }
}
