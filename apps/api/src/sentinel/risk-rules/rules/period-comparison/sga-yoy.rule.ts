import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { findRowByCandidates } from '../../account-finder';
import { valueAtMonth } from '../../bs-transition-helper';

/**
 * C-19: 主要販管費の前年同月比 ±50% 超変動 検知。
 *
 * 主要販管費 (人件費系・広告宣伝費・接待交際費・支払手数料・地代家賃・支払報酬・研修費・通信費・旅費交通費)
 * を対象に、前年同月との比較を行う。1 件の科目につき 1 RiskFinding (scopeKey に科目名)。
 *
 * 前年データが取得できない場合は判定保留。
 */
@Injectable()
export class SgaYoyRule implements RiskRule {
  readonly key = 'SGA_YOY_VARIANCE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '主要販管費の前年同月比 ±50% 超変動';

  private readonly BASE_SCORE = 45;
  private readonly THRESHOLD = 0.5;

  /** 監視対象の販管費科目 (頻度高め) */
  private readonly TARGETS: { name: string; candidates: string[] }[] = [
    { name: '広告宣伝費', candidates: ['広告宣伝費'] },
    { name: '接待交際費', candidates: ['接待交際費', '交際費'] },
    { name: '支払手数料', candidates: ['支払手数料'] },
    { name: '支払報酬', candidates: ['支払報酬', '報酬'] },
    { name: '地代家賃', candidates: ['地代家賃'] },
    { name: '通信費', candidates: ['通信費'] },
    { name: '旅費交通費', candidates: ['旅費交通費'] },
    { name: '研修費', candidates: ['研修費', '教育訓練費'] },
  ];

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const [current, prior] = await Promise.all([
      ctx.mfApi.getTransitionPL(ctx.orgId, ctx.fiscalYear, ctx.month).catch(() => null),
      ctx.mfApi.getTransitionPL(ctx.orgId, ctx.fiscalYear - 1, ctx.month).catch(() => null),
    ]);
    if (!current || !prior) return [];

    const drafts: RiskFindingDraft[] = [];

    for (const target of this.TARGETS) {
      const curRow = findRowByCandidates(current.rows, target.candidates);
      const priRow = findRowByCandidates(prior.rows, target.candidates);
      if (!curRow || !priRow) continue;

      const cur = valueAtMonth(curRow, current, ctx.month);
      const pri = valueAtMonth(priRow, prior, ctx.month);
      if (cur === null || pri === null) continue;
      if (pri <= 0) continue;

      const diff = cur - pri;
      const ratio = diff / pri;
      if (Math.abs(ratio) <= this.THRESHOLD) continue;

      const ratioPct = Math.round(ratio * 100);
      const score = computeRiskScore(this.BASE_SCORE, Math.abs(diff));
      const direction = ratio > 0 ? '増加' : '減少';

      drafts.push({
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: target.name,
        title: `${target.name}が前年同月比 ${ratioPct > 0 ? '+' : ''}${ratioPct}% (${formatYen(pri)} → ${formatYen(cur)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} の${target.name}は ${formatYen(cur)} で、 ` +
          `前年同月 ${formatYen(pri)} から ${formatYen(diff)} (${ratioPct > 0 ? '+' : ''}${ratioPct}%) ${direction}しています。`,
        riskScore: score,
        flags: ['yoy_variance', ratio > 0 ? 'increase' : 'decrease'],
        evidence: {
          accountName: target.name,
          currentAmount: cur,
          priorYearAmount: pri,
          diff,
          ratioPct,
          fiscalYear: ctx.fiscalYear,
          priorFiscalYear: ctx.fiscalYear - 1,
          month: ctx.month,
          source: 'mf_transition_pl x2',
        },
        recommendedAction:
          `${target.name}の主要取引先と取引内容を確認し、変動要因を特定してください。 ` +
          '臨時の支出 / 単発キャンペーン / 価格改定など一過性なら継続するか判断、 ' +
          '構造的な変動なら予算側にも反映が必要です。',
      });
    }

    return drafts;
  }
}
