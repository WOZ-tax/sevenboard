import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * A-13: 仮受金が 60 日超滞留している検知。
 *
 * 用途不明の入金を一時的に受ける勘定。本来は速やかに本来科目 (売上 / 売掛金回収 / 借入金等)
 * に振替されるべきで、長期滞留は内容確認漏れの可能性。
 */
@Injectable()
export class SuspenseStagnantRule implements RiskRule {
  readonly key = 'SUSPENSE_STAGNANT';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '仮受金が 60 日超滞留';

  private readonly BASE_SCORE = 55;
  private readonly MIN_AMOUNT = 50_000;
  private readonly DRIFT_THRESHOLD = 0.2;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(transition.rows, 'unidentifiedReceipts');
    if (!row) return [];

    const recent = recentMonthlyValues(row, transition, ctx.month, 3);
    if (recent.length < 3) return [];

    const [current, prev, prev2] = recent.map((r) => r.value);
    if (
      current < this.MIN_AMOUNT ||
      prev < this.MIN_AMOUNT ||
      prev2 < this.MIN_AMOUNT
    ) {
      return [];
    }

    // 2 ヶ月分のいずれも同水準で残っている
    const drift1 = Math.abs(current - prev) / prev;
    const drift2 = Math.abs(prev - prev2) / prev2;
    if (drift1 > this.DRIFT_THRESHOLD || drift2 > this.DRIFT_THRESHOLD) {
      return [];
    }

    const score = computeRiskScore(this.BASE_SCORE, current);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `仮受金が 2 ヶ月以上振替されずに残っています (${formatYen(current)})`,
        body:
          `仮受金残高が直近 3 ヶ月 ${formatYen(prev2)} → ${formatYen(prev)} → ${formatYen(current)} で推移し、 ` +
          `本来科目への振替がされていない状態が続いています。 ` +
          `用途不明の入金が長期化すると、計上漏れ収益や借入金の取り違いに気づきにくくなります。`,
        riskScore: score,
        flags: ['stagnant', 'over_60days'],
        evidence: {
          accountName: row.name,
          monthlyBalances: recent,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction:
          '仮受金の入金日と金額から、振込元と取引内容を特定してください。 ' +
          '売上の入金漏れであれば売掛金消込、借入金や前受金などであれば該当科目への振替仕訳を起こします。',
      },
    ];
  }
}
