import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { recentMonthlyValues } from '../../bs-transition-helper';

/**
 * A-9 / A-10 / A-11 統合: 預り金 (源泉所得税 / 社会保険 / 住民税) の異常検知。
 *
 * 補助科目別の精緻な突合 (給与×概算税率、法定福利費との突合等) は給与計算データが
 * 必要で重いため、L1 では簡易版として「預り金合計残高の月次変動が異常」を検知する。
 *
 * 検知パターン:
 *   1. 残高が 3 ヶ月連続で増加 (納付漏れの兆候)
 *   2. 残高が前月比 +50% 超 (給与計上に対して納付が遅延)
 *
 * 補助科目別の精緻判定は L3 LLM 「AI詳細チェック」で行う。
 */
@Injectable()
export class WithholdingAnomalyRule implements RiskRule {
  readonly key = 'WITHHOLDING_BALANCE_ANOMALY';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '預り金残高の異常 (納付漏れ・遅延の疑い)';

  private readonly BASE_SCORE = 70;
  private readonly SURGE_THRESHOLD = 0.5;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const transition = await ctx.mfApi.getTransitionBS(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(transition.rows, 'withholdingPayables');
    if (!row) return [];

    const recent = recentMonthlyValues(row, transition, ctx.month, 4);
    if (recent.length < 4) return [];

    const [current, m1, m2, m3] = recent.map((r) => r.value);

    // パターン 1: 3 ヶ月連続増加
    const continuousGrowth =
      current > m1 && m1 > m2 && m2 > m3 && m3 > 0;

    // パターン 2: 前月比 +50% 超
    const surge = m1 > 0 && (current - m1) / m1 > this.SURGE_THRESHOLD;

    if (!continuousGrowth && !surge) return [];

    const flags: string[] = [];
    let title = '';
    let body = '';
    let recommendedAction = '';

    if (surge) {
      const ratioPct = Math.round(((current - m1) / m1) * 100);
      flags.push('surge', `ratio_+${ratioPct}pct`);
      title = `預り金が前月比 +${ratioPct}% 急増 (${formatYen(m1)} → ${formatYen(current)})`;
      body =
        `${formatPeriod(ctx.fiscalYear, ctx.month)} 末の預り金は ${formatYen(current)} で、 ` +
        `前月の ${formatYen(m1)} から ${formatYen(current - m1)} 増加 (+${ratioPct}%)。 ` +
        `給与計算後の源泉所得税・住民税・社会保険料の納付が遅延している可能性があります。`;
      recommendedAction =
        '補助科目別の預り金残高を確認し、源泉所得税 / 住民税 / 社会保険料 のどれが滞留しているか特定してください。 ' +
        '納付期限超過があれば延滞税が発生するため早急に納付し、再発防止のため納付スケジュールをカレンダーに登録します。';
    } else {
      flags.push('continuous_growth');
      title = `預り金が 3 ヶ月連続で増加 (${formatYen(m3)} → ${formatYen(current)})`;
      body =
        `預り金残高は 3 ヶ月連続で増加しています ` +
        `(${formatYen(m3)} → ${formatYen(m2)} → ${formatYen(m1)} → ${formatYen(current)})。 ` +
        `給与から徴収した源泉税・住民税・社保の納付が継続的に行われていない可能性があります。`;
      recommendedAction =
        '源泉所得税 (毎月 10 日)、住民税 (毎月 10 日)、社会保険料 (毎月末) の納付状況を確認してください。 ' +
        '納付済であれば仕訳の取消し漏れ、未納付であれば即時納付が必要です。';
    }

    const score = computeRiskScore(this.BASE_SCORE, current);

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title,
        body,
        riskScore: score,
        flags,
        evidence: {
          accountName: row.name,
          currentBalance: current,
          monthlyBalances: recent,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_bs',
        },
        recommendedAction,
      },
    ];
  }
}
