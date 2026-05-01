import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * E-23: 仮受消費税の計上漏れ検知。
 *
 * 課税事業者で税抜経理を採用している場合、売上計上に応じて仮受消費税が動くはず。
 * 過去 3 ヶ月計上があり、当月ゼロ → 売上仕訳の課税区分漏れの可能性。
 */
@Injectable()
export class ConsumptionTaxReceivedMissingRule implements RiskRule {
  readonly key = 'CONSUMPTION_TAX_RECEIVED_MISSING';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '仮受消費税の月次計上漏れ';

  private readonly BASE_SCORE = 70;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(transition.rows, 'consumptionTaxReceived');
    if (!row) return [];

    const recent = recentMonthlyValues(row, transition, ctx.month, 4);
    if (recent.length < 4) return [];

    const [current, m1, m2, m3] = recent.map((r) => r.value);
    if (current !== 0) return [];

    const priorOccurrences = [m1, m2, m3].filter((v) => v !== 0).length;
    if (priorOccurrences === 0) return [];

    const monthlyAvg = ([m1, m2, m3].reduce((a, b) => a + b, 0)) / Math.max(priorOccurrences, 1);
    const score = computeRiskScore(this.BASE_SCORE, Math.abs(monthlyAvg));

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `仮受消費税の当月残高が 0 円 (前 3 ヶ月平均 ${formatYen(monthlyAvg)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の仮受消費税残高がゼロですが、 ` +
          `直前 3 ヶ月では推移があります。 ` +
          `売上仕訳の課税区分が漏れている、または売上計上自体が抜けている可能性があります。`,
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
          '当月の売上仕訳の課税区分と、売上計上自体の有無を確認してください。 ' +
          '免税取引や非課税取引が増えた場合は意図的にゼロになり得るため、売上明細との突合が必要です。',
      },
    ];
  }
}
