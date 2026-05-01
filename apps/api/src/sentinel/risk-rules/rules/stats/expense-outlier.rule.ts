import { Injectable, Logger } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';
import { computeIqr, scoreDeviation } from '../../stats-helper';

/**
 * L2-A: 販管費の科目別逸脱検知 (会社固有の正常レンジから外れる)。
 *
 * 過去 24 ヶ月の ActualEntry を元に、科目ごとの月次値の分布を把握し、
 * 当月値が IQR ベースの fence を超えている科目を逸脱として検知する。
 *
 * - 対象は AccountCategory が SELLING_EXPENSE / ADMIN_EXPENSE の科目
 * - 過去 12 ヶ月以上の実績がある科目のみ判定 (短期間では統計的根拠が弱い)
 * - 1 件 = 1 科目で scopeKey に accountId を設定
 *
 * 「この会社では月 10 〜 15 万が標準だった接待交際費が今月 45 万」のような
 * 会社固有の異常を拾うのが狙い。bixid の 300 項目ルールでは検知できない領域。
 */
@Injectable()
export class ExpenseOutlierRule implements RiskRule {
  readonly key = 'EXPENSE_OUTLIER';
  readonly layer = RiskLayer.L2_STATS;
  readonly description = '販管費の科目別逸脱 (会社固有の正常レンジから外れる)';
  private readonly logger = new Logger('ExpenseOutlierRule');

  /** 統計判定に必要な最小月数 */
  private readonly MIN_MONTHS = 12;
  /** 当月値の絶対値がこの閾値未満の場合は無視 (端数や些少経費でノイズになる) */
  private readonly MIN_AMOUNT = 50_000;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    // 過去 24 ヶ月分の月初日付一覧を作る (当月含む)
    const targetMonthStart = new Date(Date.UTC(ctx.fiscalYear, ctx.month - 1, 1));
    const earliestMonthStart = new Date(
      Date.UTC(ctx.fiscalYear, ctx.month - 1 - 24, 1),
    );

    const accounts = await ctx.prisma.accountMaster.findMany({
      where: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        category: { in: ['SELLING_EXPENSE', 'ADMIN_EXPENSE'] },
      },
    });
    if (accounts.length === 0) return [];

    const accountIds = accounts.map((a) => a.id);
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const entries = await ctx.prisma.actualEntry.findMany({
      where: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        accountId: { in: accountIds },
        month: {
          gte: earliestMonthStart,
          lte: targetMonthStart,
        },
        // 部門集計しない (departmentId 別行を合算)
      },
      select: {
        accountId: true,
        month: true,
        amount: true,
      },
    });

    // 科目 × 月 で合算 (departmentId 別行を畳む)
    const byAccountMonth = new Map<string, Map<string, number>>();
    for (const e of entries) {
      const monthKey = e.month.toISOString().slice(0, 7); // 'YYYY-MM'
      if (!byAccountMonth.has(e.accountId)) {
        byAccountMonth.set(e.accountId, new Map());
      }
      const inner = byAccountMonth.get(e.accountId)!;
      inner.set(monthKey, (inner.get(monthKey) ?? 0) + Number(e.amount));
    }

    const targetMonthKey = targetMonthStart.toISOString().slice(0, 7);
    const drafts: RiskFindingDraft[] = [];

    for (const [accountId, monthMap] of byAccountMonth) {
      const account = accountMap.get(accountId);
      if (!account) continue;

      const currentValue = monthMap.get(targetMonthKey);
      if (currentValue === undefined) continue;
      if (Math.abs(currentValue) < this.MIN_AMOUNT) continue;

      // 過去月 (target を除く) の値配列を作る
      const pastValues: number[] = [];
      for (const [monthKey, value] of monthMap) {
        if (monthKey === targetMonthKey) continue;
        pastValues.push(value);
      }
      if (pastValues.length < this.MIN_MONTHS) continue;

      const summary = computeIqr(pastValues);
      const deviation = scoreDeviation(currentValue, summary);
      if (!deviation) continue;

      // material_multiplier も併用 (大きな金額の異常は更にスコアが上がる)
      const baseScore = deviation.score;
      const finalScore = computeRiskScore(baseScore, currentValue);

      const directionLabel = deviation.direction === 'high' ? '通常を超える支出' : '通常を下回る計上';
      const sigmaLabel = `IQR の ${deviation.sigma.toFixed(1)} 倍`;

      drafts.push({
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: accountId,
        title:
          deviation.direction === 'high'
            ? `${account.name}が通常レンジを超過 (${formatYen(currentValue)})`
            : `${account.name}が通常レンジを下回る (${formatYen(currentValue)})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} の${account.name}は ${formatYen(currentValue)} で、 ` +
          `過去 ${summary.count} ヶ月の中央値 ${formatYen(summary.median)} (Q1=${formatYen(summary.q1)}、Q3=${formatYen(summary.q3)}) から${sigmaLabel}逸脱しています (${directionLabel})。 ` +
          `この会社の通常パターンから外れた値です。`,
        riskScore: finalScore,
        flags: [
          'iqr_outlier',
          deviation.direction === 'high' ? 'over_range' : 'under_range',
        ],
        evidence: {
          accountId,
          accountName: account.name,
          accountCode: account.code,
          currentValue,
          historyCount: summary.count,
          median: summary.median,
          q1: summary.q1,
          q3: summary.q3,
          iqr: summary.iqr,
          lowerFence: summary.lowerFence,
          upperFence: summary.upperFence,
          sigma: deviation.sigma,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'actual_entries (24 month history)',
        },
        recommendedAction:
          deviation.direction === 'high'
            ? `${account.name}の当月仕訳を確認し、増加要因を特定してください。 ` +
              '一過性 (キャンペーン・スポット支出) なら来月以降の見通しに反映、 ' +
              '構造的増加なら予算側にも反映が必要です。'
            : `${account.name}の当月仕訳を確認し、計上漏れがないか確認してください。 ` +
              '通常発生する科目で当月だけ大幅に少ない場合、計上もれや科目振替ミスの可能性があります。',
      });
    }

    this.logger.log(
      `expense-outlier: scanned ${byAccountMonth.size} accounts, detected ${drafts.length} outliers`,
    );

    return drafts;
  }
}
