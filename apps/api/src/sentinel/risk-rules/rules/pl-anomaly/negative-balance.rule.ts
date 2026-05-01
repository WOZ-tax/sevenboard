import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import { TB_COL } from '../../../../mf/types/mf-api.types';
import type { MfReportRow } from '../../../../mf/types/mf-api.types';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';

/**
 * B-14: マイナス残高検知 (全勘定走査)。
 *
 * BS / PL 試算表の全勘定を再帰的に走査し、closing_balance < 0 となっている科目を検出。
 * ただし以下は別ルールで個別検知するため除外:
 *   - 売掛金 (AR_NEGATIVE_BALANCE)
 *   - 買掛金 (AP_NEGATIVE_BALANCE)
 *
 * 1 件 = 1 RiskFinding として scopeKey に科目名をセットする (科目別の独立した検知となる)。
 */
@Injectable()
export class NegativeBalanceRule implements RiskRule {
  readonly key = 'NEGATIVE_BALANCE_GENERIC';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = 'マイナス残高 (売掛金・買掛金以外の全科目)';

  private readonly BASE_SCORE = 80;
  private readonly EXCLUDED = new Set(['売掛金', '売上債権', '買掛金', '仕入債務']);
  /** ノイズ抑制: 絶対値 1 万円未満は無視 (システム端数や誤差) */
  private readonly MIN_AMOUNT = 10_000;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const [bs, pl] = await Promise.all([
      ctx.mfApi.getTrialBalanceBS(ctx.orgId, ctx.fiscalYear, ctx.month),
      ctx.mfApi.getTrialBalancePL(ctx.orgId, ctx.fiscalYear, ctx.month),
    ]);
    const drafts: RiskFindingDraft[] = [];
    this.walkRows(bs.rows, drafts, ctx, 'BS');
    this.walkRows(pl.rows, drafts, ctx, 'PL');
    return drafts;
  }

  private walkRows(
    rows: MfReportRow[] | null | undefined,
    drafts: RiskFindingDraft[],
    ctx: RiskRuleContext,
    side: 'BS' | 'PL',
  ): void {
    if (!rows) return;
    for (const row of rows) {
      // 集計行・合計行はスキップ (科目単位だけ見る)
      if (row.type === 'account' && !this.EXCLUDED.has(row.name)) {
        const closing = (row.values?.[TB_COL.CLOSING] ?? 0) as number;
        if (closing < 0 && Math.abs(closing) >= this.MIN_AMOUNT) {
          drafts.push(this.buildDraft(ctx, row, closing, side));
        }
      }
      if (row.rows) {
        this.walkRows(row.rows, drafts, ctx, side);
      }
    }
  }

  private buildDraft(
    ctx: RiskRuleContext,
    row: MfReportRow,
    closing: number,
    side: 'BS' | 'PL',
  ): RiskFindingDraft {
    const score = computeRiskScore(this.BASE_SCORE, closing);
    return {
      layer: this.layer,
      ruleKey: this.key,
      scopeKey: row.name, // 科目名で検知を分ける
      title: `${row.name} がマイナス残高 (${formatYen(closing)})`,
      body:
        `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の ${row.name} 残高は ${formatYen(closing)} で、` +
        `通常の正残では発生しない値です。仕訳の貸借取り違え、計上タイミングの誤り、または振替科目の不整合が疑われます。`,
      riskScore: score,
      flags: ['negative_balance', side === 'BS' ? 'side_bs' : 'side_pl'],
      evidence: {
        accountName: row.name,
        closingBalance: closing,
        side,
        fiscalYear: ctx.fiscalYear,
        month: ctx.month,
        source: side === 'BS' ? 'mf_trial_balance_bs' : 'mf_trial_balance_pl',
      },
      recommendedAction:
        '当該科目の総勘定元帳を確認し、貸借が逆になった仕訳または計上漏れの仕訳を特定してください。 ' +
        '修正仕訳を月次決算前に起こします。',
    };
  }
}
