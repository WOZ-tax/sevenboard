import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { getCurrentAndPrevBalance } from '../../bs-transition-helper';

/**
 * A-1: 売掛金残高急増検知。
 *
 * BS 推移表から対象月と前月の売掛金残高を比較し、+30% 超の増加を検知する。
 * 通常の月次成長を超える急増は、回収サイト遅延、特定大口取引先からの未回収、
 * または計上タイミングの誤りが疑われる。
 */
@Injectable()
export class ArSurgeRule implements RiskRule {
  readonly key = 'AR_BALANCE_SURGE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '売掛金残高が前月比 +30% 超の急増';

  private readonly BASE_SCORE = 60;
  private readonly THRESHOLD = 0.3; // +30%

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const arRow = findAccountRow(transition.rows, 'accountsReceivable');
    if (!arRow) return [];

    const { current, prev } = getCurrentAndPrevBalance(
      arRow,
      transition,
      ctx.month,
    );
    if (current === null || prev === null) return [];
    if (prev <= 0) return []; // 前月ゼロや負残はこのルールで判定しない (ar-negative.rule に委ねる)
    if (current <= prev) return [];

    const ratio = (current - prev) / prev;
    if (ratio <= this.THRESHOLD) return [];

    const delta = current - prev;
    const score = computeRiskScore(this.BASE_SCORE, delta);
    const ratioPct = Math.round(ratio * 100);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `売掛金が前月比 +${ratioPct}% 急増 (${formatYen(prev)} → ${formatYen(current)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の売掛金残高は ${formatYen(current)} となり、 ` +
          `前月の ${formatYen(prev)} から ${formatYen(delta)} (+${ratioPct}%) の増加です。 ` +
          `通常の月次変動を超える水準であり、特定大口取引先の回収遅延または計上タイミングの偏りが疑われます。`,
        riskScore: score,
        flags: ['surge', `ratio_+${ratioPct}pct`],
        evidence: {
          accountName: arRow.name,
          currentBalance: current,
          prevBalance: prev,
          delta,
          ratioPct,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction:
          '取引先別の補助科目残高を確認し、サイトを超えて未回収の取引先を特定してください。 ' +
          '回収遅延であれば請求・督促のフォロー、月末計上の偏りであれば翌月以降の入金見込みを資金繰り表に反映する必要があります。',
      },
    ];
  }
}
