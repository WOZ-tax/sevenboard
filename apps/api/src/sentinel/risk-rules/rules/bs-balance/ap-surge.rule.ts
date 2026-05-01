import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { getCurrentAndPrevBalance } from '../../bs-transition-helper';

/**
 * A-4: 買掛金残高急増検知。
 *
 * BS 推移表から対象月と前月の買掛金残高を比較し、+30% 超の増加を検知する。
 * 仕入急増、特定仕入先への支払繰延べ、月末計上タイミングの偏りが疑われる。
 */
@Injectable()
export class ApSurgeRule implements RiskRule {
  readonly key = 'AP_BALANCE_SURGE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '買掛金残高が前月比 +30% 超の急増';

  private readonly BASE_SCORE = 55;
  private readonly THRESHOLD = 0.3;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const apRow = findAccountRow(transition.rows, 'accountsPayable');
    if (!apRow) return [];

    const { current, prev } = getCurrentAndPrevBalance(
      apRow,
      transition,
      ctx.month,
    );
    if (current === null || prev === null) return [];
    if (prev <= 0) return [];
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
        title: `買掛金が前月比 +${ratioPct}% 急増 (${formatYen(prev)} → ${formatYen(current)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の買掛金残高は ${formatYen(current)} となり、 ` +
          `前月の ${formatYen(prev)} から ${formatYen(delta)} (+${ratioPct}%) の増加です。 ` +
          `仕入急増、支払繰延べ、または月末計上の偏りが要因と推測されます。`,
        riskScore: score,
        flags: ['surge', `ratio_+${ratioPct}pct`],
        evidence: {
          accountName: apRow.name,
          currentBalance: current,
          prevBalance: prev,
          delta,
          ratioPct,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction:
          '仕入先別の補助科目残高と直近の仕入仕訳を確認し、急増要因を特定してください。 ' +
          '支払繰延べが意図的なら資金繰り表へ反映、計上タイミングの偏りなら翌月以降の支出見込みを更新します。',
      },
    ];
  }
}
