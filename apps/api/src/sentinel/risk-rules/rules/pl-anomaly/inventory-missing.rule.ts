import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow, findRowByCandidates } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { valueAtMonth } from '../../bs-transition-helper';

/**
 * B-16: 棚卸計上漏れ検知 (期末月のみ)。
 *
 * 検知条件:
 *   1. 対象月が決算月 (Organization.fiscalMonthEnd) と一致
 *   2. 棚卸資産 (商品 / 製品 / 原材料) の残高が前年同月と完全に同じ、または期首から不変
 *      = 実地棚卸を反映していない疑い
 *
 * 月次棚卸を行う会社は少ないため、月次でこのルールを動かすと誤検知が増える。
 * したがって決算月のみアクティブにする。
 */
@Injectable()
export class InventoryMissingRule implements RiskRule {
  readonly key = 'INVENTORY_MISSING_AT_YEAR_END';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '期末棚卸の計上漏れ (期末月のみ判定)';

  private readonly BASE_SCORE = 65;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    // 決算月かどうか確認
    const org = await ctx.prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { fiscalMonthEnd: true },
    });
    if (!org) return [];
    if (org.fiscalMonthEnd !== ctx.month) return []; // 期末月以外はスキップ

    const bsTransition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const inventoryRow = findAccountRow(bsTransition.rows, 'inventory');
    if (!inventoryRow) return [];

    const yearEndBalance = valueAtMonth(inventoryRow, bsTransition, ctx.month);
    if (yearEndBalance === null) return [];

    // 試算表で期首値を見る (opening balance)
    const bsTrial = await ctx.mfApi.getTrialBalanceBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const trialRow = findAccountRow(bsTrial.rows, 'inventory');
    if (!trialRow) return [];

    const opening =
      typeof trialRow.values?.[0] === 'number' ? (trialRow.values[0] as number) : 0;

    // 期首と期末が完全一致 = 期末棚卸の計上漏れの疑い
    if (yearEndBalance !== opening) return [];
    // ゼロなら判定対象外 (棚卸資産自体が無い業種)
    if (yearEndBalance === 0) return [];

    const score = computeRiskScore(this.BASE_SCORE, yearEndBalance);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `期末棚卸の計上漏れの疑い (期首と期末が同額: ${formatYen(yearEndBalance)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} は決算月ですが、棚卸資産 (${trialRow.name}) の残高が ` +
          `期首 ${formatYen(opening)} → 期末 ${formatYen(yearEndBalance)} で完全に一致しています。 ` +
          `期中の仕入と払出があれば残高は通常変動するはずで、期末実地棚卸の反映漏れが疑われます。`,
        riskScore: score,
        flags: ['year_end', 'inventory_missing'],
        evidence: {
          accountName: trialRow.name,
          openingBalance: opening,
          yearEndBalance,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_trial_balance_bs + mf_transition_bs',
        },
        recommendedAction:
          '期末実地棚卸表をもとに、期末の棚卸資産残高 (商品・製品・原材料) を確定させてください。 ' +
          '期末仕訳「(借) 棚卸資産 / (貸) 期末商品棚卸高」または同等の仕訳が必要です。',
      },
    ];
  }
}
