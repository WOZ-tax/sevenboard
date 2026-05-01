import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { findAccountRow } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import {
  buildCalendarMonths,
  valueAtMonth,
} from '../../bs-transition-helper';

/**
 * B-17: 役員報酬の月途中変動 (定期同額違反疑い) 検知。
 *
 * 法人税法上、役員報酬は「定期同額給与」として毎月同額で支給する必要があり、
 * 期首から 3 ヶ月以内に変更を確定させなければならない (それ以降の変動は損金不算入)。
 *
 * 検知ロジック:
 *   1. PL 推移表で対象月の役員報酬を取得
 *   2. 前月と比較して金額が異なる
 *   3. かつ対象月が「期首から 4 ヶ月目以降」(= 3 ヶ月の変更猶予期間後)
 *
 * 注: 役員交代や賞与計上 (定時総会で別途決議) のケースは誤検知になるため、
 * 推奨アクションで「総会議事録の確認」を促す。
 */
@Injectable()
export class ExecutiveCompMidChangeRule implements RiskRule {
  readonly key = 'EXECUTIVE_COMP_MID_CHANGE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '役員報酬の期首から 4 ヶ月目以降の変動 (定期同額違反疑い)';

  private readonly BASE_SCORE = 85;
  /** 1 万円未満の差は端数とみなす */
  private readonly DIFF_THRESHOLD = 10_000;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const org = await ctx.prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { fiscalMonthEnd: true },
    });
    if (!org) return [];

    // 期首月 = 期末月 + 1 (12 を超えたら 1 に戻す)
    const startMonth = (org.fiscalMonthEnd % 12) + 1;
    // 対象月が期首から何ヶ月目か (1-indexed)
    const monthsFromStart = ((ctx.month - startMonth + 12) % 12) + 1;
    if (monthsFromStart <= 3) return []; // 期首 3 ヶ月以内の変更は OK

    const plTransition = await ctx.mfApi.getTransitionPL(
      ctx.orgId,
      ctx.fiscalYear,
      ctx.month,
    );
    const row = findAccountRow(
      plTransition.rows,
      'executiveCompensation',
    );
    if (!row) return [];

    const calendarMonths = buildCalendarMonths(plTransition);
    const idx = calendarMonths.indexOf(ctx.month);
    if (idx === -1) return [];

    const current = (row.values?.[idx] as number) ?? 0;
    if (current === 0) return []; // 当月計上が無いケースは別ルール

    // 期首から当月 1 つ前までの月で比較ベースを作る (期首月の値を base とする)
    let base: number | null = null;
    for (let i = 0; i < idx; i++) {
      const v = (row.values?.[i] as number) ?? 0;
      if (v > 0) {
        base = v;
        break; // 期首月から走査して最初に見つかった値を base にする
      }
    }
    if (base === null) return [];
    if (Math.abs(current - base) < this.DIFF_THRESHOLD) return [];

    const diff = current - base;
    const score = computeRiskScore(this.BASE_SCORE, Math.abs(diff));

    return [
      {
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: '',
        title: `役員報酬が期首と異なる金額で計上されています (${formatYen(base)} → ${formatYen(current)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} の役員報酬は ${formatYen(current)} で、 ` +
          `期首月 (${startMonth}月) の ${formatYen(base)} から ${formatYen(diff)} の差があります。 ` +
          `定期同額給与は期首から 3 ヶ月以内に変更を確定する必要があり、それ以降の変動は損金不算入のリスクがあります。`,
        riskScore: score,
        flags: ['executive_comp', 'periodic_breach'],
        evidence: {
          accountName: row.name,
          fiscalStartMonth: startMonth,
          baseMonthAmount: base,
          currentMonthAmount: current,
          diff,
          monthsFromStart,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_transition_pl',
        },
        recommendedAction:
          '当月の変動が役員交代・職位変更・賞与決議などの正当事由に基づくか、株主総会議事録で確認してください。 ' +
          '正当事由なしの場合は当月以降の差額が損金不算入となるため、税務上の影響を試算する必要があります。',
      },
    ];
  }
}
