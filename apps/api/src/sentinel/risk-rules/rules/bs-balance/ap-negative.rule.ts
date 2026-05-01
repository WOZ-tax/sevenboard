import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import { TB_COL } from '../../../../mf/types/mf-api.types';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';

/**
 * A-5: 買掛金マイナス残高検知。
 *
 * 買掛金は通常、貸方残（プラスの負債残高）となるべき。マイナス残高は
 * 過払い・支払の二重計上・補助科目振替ミスが疑われる。
 *
 * 注: MF の BS では負債は正の値で表示される。closing_balance < 0 は
 * 借方優位（=過払い等）を意味する。
 */
@Injectable()
export class ApNegativeRule implements RiskRule {
  readonly key = 'AP_NEGATIVE_BALANCE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '買掛金がマイナス残高 (過払い・二重計上の疑い)';

  private readonly BASE_SCORE = 80;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const bs = await ctx.mfApi.getTrialBalanceBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const apRow = findAccountRow(bs.rows, 'accountsPayable');
    if (!apRow) return [];

    const closing = (apRow.values?.[TB_COL.CLOSING] ?? 0) as number;
    if (closing >= 0) return [];

    const amount = closing;
    const score = computeRiskScore(this.BASE_SCORE, amount);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `買掛金がマイナス残高 (${formatYen(amount)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} 末時点で買掛金残高が ${formatYen(amount)} となっています。 ` +
          `過払い、支払の二重計上、補助科目間の振替ミスのいずれかが疑われます。`,
        riskScore: score,
        flags: ['negative_balance'],
        evidence: {
          accountName: apRow.name,
          closingBalance: closing,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_trial_balance_bs',
        },
        recommendedAction:
          '補助科目別残高と直近の支払仕訳を確認してください。 ' +
          '過払いであれば仕入先からの返金または前払金への振替、二重計上であれば修正仕訳が必要です。',
      },
    ];
  }
}
