import { Injectable, Logger } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { computeRiskScore, formatPeriod } from '../../helpers';

/**
 * E-24: 消費税区分の混在検知。
 *
 * 同一科目で課税 / 非課税 / 不課税 / 免税 / 軽減税率が混在している場合、
 * 仕訳ミス (課税区分の入力誤り) または科目分類のグレーゾーンが疑われる。
 *
 * 検知ロジック:
 *   1. 当月の仕訳明細を取得
 *   2. 科目 (account_item_name) ごとに使われた tax_category を集計
 *   3. 同一科目で 2 種類以上の課税区分が混在 (それぞれ件数 1 以上) なら検知
 *   4. 「不課税」と「対象外」のような実質同義の混在は除外
 */
@Injectable()
export class TaxCategoryMixedRule implements RiskRule {
  readonly key = 'TAX_CATEGORY_MIXED';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '同一科目で複数の消費税区分が混在';
  private readonly logger = new Logger('TaxCategoryMixedRule');

  private readonly BASE_SCORE = 60;

  /** 検知対象から除外する科目 (混在が当然なもの) */
  private readonly EXCLUDED_ACCOUNTS = new Set([
    '現金',
    '当座預金',
    '普通預金',
    '定期預金',
    '売掛金',
    '買掛金',
    '未払金',
    '未収入金',
    '前受金',
    '前払金',
    '預り金',
    '仮払金',
    '仮受金',
  ]);

  /** 実質同義とみなす課税区分のグループ。同一グループ内の混在は無視。 */
  private readonly SYNONYM_GROUPS: string[][] = [
    ['不課税', '対象外'],
    ['課税仕入', '課対仕入', '仕入'],
  ];

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const startDate = `${ctx.fiscalYear}-${String(ctx.month).padStart(2, '0')}-01`;
    const endDateObj = new Date(Date.UTC(ctx.fiscalYear, ctx.month, 0));
    const endDate = `${endDateObj.getUTCFullYear()}-${String(endDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(endDateObj.getUTCDate()).padStart(2, '0')}`;

    const result = await ctx.mfApi.getJournals(ctx.orgId, { startDate, endDate });
    const journals: Journal[] = Array.isArray(result?.journals) ? result.journals : [];

    // 科目別の課税区分カウント
    const map = new Map<string, Map<string, number>>();
    for (const j of journals) {
      const items = Array.isArray(j.items) ? j.items : [];
      for (const item of items) {
        const account = (item.account_item_name || item.account_name || '').toString().trim();
        if (!account || this.EXCLUDED_ACCOUNTS.has(account)) continue;
        const taxCat = this.normalizeTaxCategory(
          (item.tax_category || item.tax_code || '').toString().trim(),
        );
        if (!taxCat) continue;
        if (!map.has(account)) map.set(account, new Map());
        const inner = map.get(account)!;
        inner.set(taxCat, (inner.get(taxCat) ?? 0) + 1);
      }
    }

    const drafts: RiskFindingDraft[] = [];
    for (const [account, taxMap] of map) {
      if (taxMap.size < 2) continue;
      const breakdown = [...taxMap.entries()].sort((a, b) => b[1] - a[1]);
      const total = breakdown.reduce((s, [, c]) => s + c, 0);
      // 主要区分の比率が 95% 超 = ノイズなので無視 (例: 99% 課税仕入 + 1% 不課税)
      const top = breakdown[0];
      if (top[1] / total > 0.95) continue;

      const breakdownText = breakdown
        .map(([cat, c]) => `${cat}: ${c}件`)
        .join('、');
      const score = computeRiskScore(this.BASE_SCORE, total * 10000); // 件数を概算金額換算

      drafts.push({
        layer: this.layer,
        ruleKey: this.key,
        scopeKey: account,
        title: `${account} で消費税区分が混在 (${breakdownText})`,
        body:
          `${formatPeriod(ctx.fiscalYear, ctx.month)} の${account}仕訳で、 ` +
          `複数の消費税区分が使われています (${breakdownText})。 ` +
          `課税区分の入力誤りか、同一科目内に異なる性質の取引が混入している可能性があります。`,
        riskScore: score,
        flags: ['tax_category', 'mixed'],
        evidence: {
          accountName: account,
          breakdown: Object.fromEntries(taxMap),
          totalCount: total,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          source: 'mf_journals',
        },
        recommendedAction:
          `${account}の仕訳明細から、各課税区分の取引内容を確認してください。 ` +
          '区分入力ミスなら修正、同一科目内に異なる性質の取引があるなら科目分割を検討します。',
      });
    }

    return drafts;
  }

  private normalizeTaxCategory(raw: string): string {
    if (!raw) return '';
    for (const group of this.SYNONYM_GROUPS) {
      if (group.includes(raw)) return group[0];
    }
    return raw;
  }
}

interface Journal {
  items?: JournalItem[];
}

interface JournalItem {
  account_item_name?: string;
  account_name?: string;
  tax_category?: string;
  tax_code?: string;
}
