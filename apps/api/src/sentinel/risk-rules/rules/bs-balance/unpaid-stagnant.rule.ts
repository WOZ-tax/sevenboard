import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * A-7: 未払金の長期滞留検知 (60 日以上動きなし)。
 *
 * BS 推移ベースの簡易判定。直近 2 ヶ月の残高がほぼ同じ (差 5% 以内、絶対値 10 万円以上)
 * → 滞留候補として検知。
 * 取引先別の精緻判定は仕訳明細または補助科目別残高を取得する段階で実装する。
 */
@Injectable()
export class UnpaidStagnantRule implements RiskRule {
  readonly key = 'UNPAID_STAGNANT';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '未払金が 2 ヶ月以上ほぼ動いていない (滞留候補)';

  private readonly BASE_SCORE = 50;
  private readonly DRIFT_THRESHOLD = 0.05;
  private readonly MIN_AMOUNT = 100_000;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(transition.rows, 'unpaidExpenses');
    if (!row) return [];

    const recent = recentMonthlyValues(row, transition, ctx.month, 2);
    if (recent.length < 2) return [];

    const [current, prev] = recent.map((r) => r.value);
    if (current < this.MIN_AMOUNT || prev < this.MIN_AMOUNT) return [];
    const drift = Math.abs(current - prev) / prev;
    if (drift > this.DRIFT_THRESHOLD) return [];

    const score = computeRiskScore(this.BASE_SCORE, current);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `未払金が 2 ヶ月動いていません (${formatYen(current)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の未払金は ${formatYen(current)} で、 ` +
          `前月 ${formatYen(prev)} からほぼ動いていません (変動 ${(drift * 100).toFixed(1)}%)。 ` +
          `通常は計上と支払が月次で発生するため、特定取引先への支払が長期化している可能性があります。`,
        riskScore: score,
        flags: ['stagnant', '60day_unchanged'],
        evidence: {
          accountName: row.name,
          currentBalance: current,
          prevBalance: prev,
          driftPct: Math.round(drift * 1000) / 10,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction:
          '取引先別の補助科目残高を確認し、長期未払となっている取引先を特定してください。 ' +
          '支払漏れであれば即時対応、支払猶予の合意があれば資金繰り表とコメントに反映します。',
      },
    ];
  }
}
