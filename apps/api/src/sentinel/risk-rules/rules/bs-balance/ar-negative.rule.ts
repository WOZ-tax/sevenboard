import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import { TB_COL } from '../../../../mf/types/mf-api.types';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';

/**
 * A-3: 売掛金マイナス残高検知。
 *
 * BS 試算表の売掛金 closing_balance < 0 を検知する。
 * 過入金 (二重入金)・売上値引/返品の二重計上・補助科目振替ミスのいずれかが原因のことが多い。
 */
@Injectable()
export class ArNegativeRule implements RiskRule {
  readonly key = 'AR_NEGATIVE_BALANCE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '売掛金がマイナス残高 (過入金・二重計上の疑い)';

  private readonly BASE_SCORE = 80;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const bs = await ctx.mfApi.getTrialBalanceBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const arRow = findAccountRow(bs.rows, 'accountsReceivable');
    if (!arRow) return [];

    const closing = (arRow.values?.[TB_COL.CLOSING] ?? 0) as number;
    if (closing >= 0) return [];

    const amount = closing; // 負の値
    const score = computeRiskScore(this.BASE_SCORE, amount);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `売掛金がマイナス残高 (${formatYen(amount)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末時点で売掛金残高が ${formatYen(amount)} となっています。 ` +
          `通常の販売活動では発生しない状態であり、過入金や売上値引/返品の二重計上、補助科目間の振替ミスが疑われます。`,
        riskScore: score,
        flags: ['negative_balance'],
        evidence: {
          accountName: arRow.name,
          closingBalance: closing,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_trial_balance_bs',
        },
        recommendedAction:
          '補助科目別残高を確認し、原因仕訳を特定してください。 ' +
          '過入金であれば前受金または他科目への振替、二重計上であれば修正仕訳の起票が必要です。',
      },
    ];
  }
}
