import { Injectable } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { ACCOUNT_CANDIDATES } from '../../account-finder';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';

/**
 * B-18: 10 万円以上の消耗品費の検知 (固定資産計上検討)。
 *
 * 税務上、10 万円以上の備品は原則固定資産計上が必要。ただし以下の特例がある:
 *   - 10 万円未満:      全額損金 (本ルール対象外)
 *   - 20 万円未満:      一括償却資産 (3 年均等償却)
 *   - 30 万円未満:      中小企業者等の少額減価償却資産特例 (年間 300 万円まで全額損金)
 *
 * 仕訳明細から消耗品費 (借方) で 10 万円以上の取引を抽出し、scope_key に仕訳 ID を入れる。
 * 期首から対象月までを走査範囲にすると重いため、対象月の 1 ヶ月分のみ検知する。
 */
@Injectable()
export class LargeConsumableRule implements RiskRule {
  readonly key = 'LARGE_CONSUMABLE_EXPENSE';
  readonly layer = RiskLayer.L1_RULE;
  readonly description = '10 万円以上の消耗品費 (固定資産計上検討)';

  private readonly BASE_SCORE = 70;
  private readonly THRESHOLD = 100_000;

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const startDate = `${ctx.fiscalYear}-${String(ctx.month).padStart(2, '0')}-01`;
    // 月末日: Date 経由で計算
    const endDateObj = new Date(Date.UTC(ctx.fiscalYear, ctx.month, 0));
    const endDate = `${endDateObj.getUTCFullYear()}-${String(endDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(endDateObj.getUTCDate()).padStart(2, '0')}`;

    const result = await ctx.mfApi.getJournals(ctx.orgId, {
      startDate,
      endDate,
    });
    const journals: Journal[] = Array.isArray(result?.journals)
      ? result.journals
      : [];

    const consumableNames = ACCOUNT_CANDIDATES.consumables;
    const drafts: RiskFindingDraft[] = [];

    for (const j of journals) {
      const items = Array.isArray(j.items) ? j.items : [];
      for (const item of items) {
        // 借方の消耗品費を探す
        const itemName = (item.account_item_name || item.account_name || '').toString();
        if (!consumableNames.some((c) => itemName.includes(c))) continue;

        const side = (item.entry_side || item.side || '').toString();
        const isDebit = side === 'debit' || side === 'DEBIT' || side === '借方';
        if (!isDebit) continue;

        const amount = Number(item.amount || item.value || 0);
        if (amount < this.THRESHOLD) continue;

        const description = (j.description || item.description || '') as string;
        const journalDate = (j.issue_date || j.journal_date || j.date || '') as string;
        const journalId = (j.id || j.journal_id || '').toString();

        const score = computeRiskScore(this.BASE_SCORE, amount);

        drafts.push({
          layer: this.layer,
          ruleKey: this.key,
          scopeKey: journalId || `${journalDate}_${amount}`,
          title: `消耗品費 ${formatYen(amount)} の計上 (固定資産計上検討)`,
          body:
            `${formatPeriod(ctx.fiscalYear, ctx.month)}、消耗品費として ${formatYen(amount)} の計上があります。 ` +
            `日付: ${journalDate}、摘要: ${description || '(摘要なし)'}。 ` +
            `10 万円以上の備品は原則として工具器具備品など固定資産計上の検討対象です。`,
          riskScore: score,
          flags: ['large_amount', 'fixed_asset_check'],
          evidence: {
            journalId,
            journalDate,
            description,
            amount,
            accountName: itemName,
            fiscalYear: ctx.fiscalYear,
            month: ctx.month,
            source: 'mf_journals',
          },
          recommendedAction:
            '摘要から内容を確認のうえ、適用すべき特例を判定してください。 ' +
            '20 万円未満なら一括償却資産 (3 年均等償却)、 ' +
            '30 万円未満なら中小企業者等の少額減価償却資産特例 (年間 300 万円まで全額損金) が選択可能です。 ' +
            '30 万円以上は工具器具備品など固定資産計上が原則です。',
        });
      }
    }

    return drafts;
  }
}

/** MF Journals API のレスポンス。型は ad-hoc に揃える。 */
interface Journal {
  id?: string;
  journal_id?: string;
  issue_date?: string;
  journal_date?: string;
  date?: string;
  description?: string;
  items?: JournalItem[];
}

interface JournalItem {
  account_item_name?: string;
  account_name?: string;
  entry_side?: string;
  side?: string;
  amount?: number;
  value?: number;
  description?: string;
}
