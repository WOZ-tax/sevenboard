import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * A-2: 売掛金が 90 日以上動いていない検知 (簡易版)。
 *
 * 補助科目別残高の API は MF 側で取得が重いため、まずは BS 推移表ベースで
 * 「過去 3 ヶ月の月末売掛金残高がほぼ変動していない (差が 5% 以内)」
 * を「滞留候補」として検知する簡易版を実装。
 *
 * 取引先別の精緻判定は L3 LLM 層または取引先別補助残高 API 連携の段階で実装する。
 */
@Injectable()
export class ArLongOverdueRule implements RiskRule {
  readonly key = 'AR_LONG_OVERDUE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '売掛金残高が 3 ヶ月ほぼ動いていない (滞留候補)';

  private readonly BASE_SCORE = 70;
  private readonly DRIFT_THRESHOLD = 0.05; // 5% 以内の変動 = 動いていないと判定

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const arRow = findAccountRow(transition.rows, 'accountsReceivable');
    if (!arRow) return [];

    const recent = recentMonthlyValues(arRow, transition, ctx.month, 3);
    if (recent.length < 3) return []; // 3 ヶ月分揃わない場合は判定保留

    const values = recent.map((r) => r.value);
    const baseline = values[values.length - 1]; // 一番古い月
    if (baseline <= 0) return [];

    const maxDrift = Math.max(
      ...values.slice(0, -1).map((v) => Math.abs(v - baseline) / baseline),
    );
    if (maxDrift > this.DRIFT_THRESHOLD) return [];

    // 動いていない = 滞留候補
    const score = computeRiskScore(this.BASE_SCORE, baseline);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `売掛金残高が 3 ヶ月ほぼ動いていません (${formatYen(baseline)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} を含む直近 3 ヶ月の売掛金残高が ` +
          `${formatYen(values[2])} → ${formatYen(values[1])} → ${formatYen(values[0])} と推移しており、` +
          `${(maxDrift * 100).toFixed(1)}% 以内の小さな変動にとどまっています。 ` +
          `通常の売上計上と入金が回っている場合は残高は月次で動くはずで、特定取引先からの長期未回収が含まれている可能性があります。`,
        riskScore: score,
        flags: ['stagnant', '3month_unchanged'],
        evidence: {
          accountName: arRow.name,
          monthlyBalances: recent,
          driftPct: Math.round(maxDrift * 1000) / 10,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction:
          '取引先別の補助科目残高を出力し、3 ヶ月以上動きのない取引先を特定してください。 ' +
          '回収困難であれば取引先と支払計画の再交渉、または貸倒引当金の計上検討が必要です。',
      },
    ];
  }
}
