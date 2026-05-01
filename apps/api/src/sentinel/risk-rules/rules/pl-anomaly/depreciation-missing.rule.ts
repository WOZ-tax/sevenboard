import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findRowByCandidates } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues, valueAtMonth } from '../../bs-transition-helper';

/**
 * B-15: 減価償却計上漏れ検知。
 *
 * 検知条件:
 *   1. PL 推移表の「減価償却費」が当月ゼロ
 *   2. かつ過去 3 ヶ月のうち 1 回以上計上があった (= この会社は月次計上をしている)
 *   3. かつ BS の固定資産 (建物 / 車両 / 器具備品) のいずれかに残高がある
 *
 * 期首にまとめて 1 年分計上する会社は誤検知するが、月次計上の慣行がある会社で
 * 当月だけ漏れているケースを拾うのが目的。
 */
@Injectable()
export class DepreciationMissingRule implements RiskRule {
  readonly key = 'DEPRECIATION_MISSING';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '減価償却の月次計上漏れ';

  private readonly BASE_SCORE = 70;

  private readonly DEPR_NAMES = ['減価償却費', '減価償却'];
  private readonly FIXED_ASSET_NAMES = [
    '建物',
    '車両運搬具',
    '工具器具備品',
    '機械装置',
    '構築物',
  ];

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const [plTransition, bsTransition] = await Promise.all([
      ctx.mfApi.getTransitionPL(ctx.orgId, ctx.fiscalYear, ctx.month),
      ctx.mfApi.getTransitionBS(ctx.orgId, ctx.fiscalYear, ctx.month),
    ]);

    const deprRow = findRowByCandidates(plTransition.rows, this.DEPR_NAMES);
    if (!deprRow) return [];

    const recent = recentMonthlyValues(deprRow, plTransition, ctx.month, 4);
    if (recent.length < 4) return [];

    const [current, m1, m2, m3] = recent.map((r) => r.value);
    if (current !== 0) return [];

    // 過去 3 ヶ月のうち 1 回以上計上 = 月次計上の慣行あり
    const priorOccurrences = [m1, m2, m3].filter((v) => v > 0).length;
    if (priorOccurrences < 1) return [];

    // 固定資産が BS に残っているか
    let hasAsset = false;
    for (const assetName of this.FIXED_ASSET_NAMES) {
      const assetRow = findRowByCandidates(bsTransition.rows, [assetName]);
      if (!assetRow) continue;
      const balance = valueAtMonth(assetRow, bsTransition, ctx.month);
      if (balance !== null && balance > 0) {
        hasAsset = true;
        break;
      }
    }
    if (!hasAsset) return [];

    const monthlyAvg = (m1 + m2 + m3) / Math.max(priorOccurrences, 1);
    const score = computeRiskScore(this.BASE_SCORE, monthlyAvg);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `減価償却費の当月計上が見当たりません (推定月額 ${formatYen(monthlyAvg)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} の減価償却費が 0 円で計上されていませんが、 ` +
          `直前 3 ヶ月では計上があり、固定資産も残っています。月次計上の慣行があるなら当月分が漏れている可能性が高いです。`,
        riskScore: score,
        flags: ['monthly_missing', 'depreciation'],
        evidence: {
          currentAmount: 0,
          recentMonthly: recent,
          priorMonthlyAverage: monthlyAvg,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_pl + mf_transition_bs',
        },
        recommendedAction:
          '固定資産台帳から当月の減価償却額を計算し、月次計上仕訳を起票してください。 ' +
          '期首にまとめて 1 年分計上する方針なら本検知は無視可です。固定資産台帳との突合で正解値を確定させます。',
      },
    ];
  }
}
