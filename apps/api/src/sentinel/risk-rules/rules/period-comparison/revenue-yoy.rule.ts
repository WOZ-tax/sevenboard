import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { findRowByCandidates } from '../../account-finder';
import { valueAtMonth } from '../../bs-transition-helper';

/**
 * C-18: 売上の前年同月比 ±30% 超変動 検知。
 *
 * 当年と前年の同月の売上を比較し、絶対値で ±30% 超なら検知。
 * 前年データが取得できない場合 (新規顧問先・初年度) は判定保留。
 */
@Injectable()
export class RevenueYoyRule implements RiskRule {
  readonly key = 'REVENUE_YOY_VARIANCE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '売上の前年同月比 ±30% 超変動';

  private readonly BASE_SCORE = 50;
  private readonly THRESHOLD = 0.3;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const [current, prior] = await Promise.all([
      ctx.mfApi.getTransitionPL(ctx.orgId, ctx.fiscalYear, ctx.month).catch(() => null),
      ctx.mfApi.getTransitionPL(ctx.orgId, ctx.fiscalYear - 1, ctx.month).catch(() => null),
    ]);
    if (!current || !prior) return [];

    const candidates = ['売上高合計', '売上高', '売上'];
    const currentRow = findRowByCandidates(current.rows, candidates);
    const priorRow = findRowByCandidates(prior.rows, candidates);
    if (!currentRow || !priorRow) return [];

    const cur = valueAtMonth(currentRow, current, ctx.month);
    const pri = valueAtMonth(priorRow, prior, ctx.month);
    if (cur === null || pri === null) return [];
    if (pri <= 0) return []; // 前年がゼロ・マイナスは判定保留

    const diff = cur - pri;
    const ratio = diff / pri;
    if (Math.abs(ratio) <= this.THRESHOLD) return [];

    const ratioPct = Math.round(ratio * 100);
    const score = computeRiskScore(this.BASE_SCORE, Math.abs(diff));
    const direction = ratio > 0 ? '増加' : '減少';

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `売上が前年同月比 ${ratioPct > 0 ? '+' : ''}${ratioPct}% (${formatYen(pri)} → ${formatYen(cur)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} の売上は ${formatYen(cur)} で、 ` +
          `前年同月の ${formatYen(pri)} から ${formatYen(diff)} (${ratioPct > 0 ? '+' : ''}${ratioPct}%) ${direction}しています。 ` +
          `通常の季節変動を超える水準であり、要因の特定が必要です。`,
        riskScore: score,
        flags: ['yoy_variance', ratio > 0 ? 'increase' : 'decrease'],
        evidence: {
          currentAmount: cur,
          priorYearAmount: pri,
          diff,
          ratioPct,
          fiscalYear: ctx.fiscalYear,
          priorFiscalYear: ctx.fiscalYear - 1,
          month: ctx.month,
          source: 'mf_transition_pl x2',
        },
        recommendedAction:
          ratio > 0
            ? '増加要因が新規大口取引・季節要因・価格改定のいずれか確認してください。 ' +
              '一過性なら来月以降の見通しに反映、継続的な成長なら予算上方修正の検討材料になります。'
            : '減少要因が大口取引離反・季節要因・価格改定・市場縮小のいずれか確認してください。 ' +
              '構造的な減少であれば資金繰り影響の試算と対策の議題化が必要です。',
      },
    ];
  }
}
