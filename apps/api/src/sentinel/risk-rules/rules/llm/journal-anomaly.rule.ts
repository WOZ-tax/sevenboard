import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { RiskLayer } from '@prisma/client';
import { createLlmProvider } from '../../../../ai/llm-provider';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from '../../types';
import { computeRiskScore, formatYen, formatPeriod } from '../../helpers';

/**
 * L3-A: 仕訳摘要の意味的異常検知 (LLM ベース)。
 *
 * 「AI詳細チェック」ボタンからのみ呼ばれる。トークン消費するため日次バッチでは実行しない。
 *
 * 当月の仕訳から、以下に該当するものを候補としてフィルタ:
 *   1. 摘要に「調整 / 仮計上 / 修正 / 振替 / 諸口 / 仮 / 不明」等の曖昧キーワードを含む
 *   2. または金額が 50 万円以上
 *
 * 候補をまとめて Claude に渡し、AI CFO として「気になる仕訳」とその理由・推奨アクションを
 * 構造化 JSON で返してもらう。
 *
 * LLM の幻覚や JSON パースエラー対策として、構造に合わない出力は丸ごと無視する。
 * (silent fail。ルール自体のエラーは Orchestrator で握る)
 */
@Injectable()
export class JournalAnomalyLlmRule implements RiskRule {
  readonly key = 'JOURNAL_ANOMALY_LLM';
  readonly layer = RiskLayer.L3_LLM;
  readonly description = '仕訳摘要の意味的異常検知 (LLM ベース)';
  private readonly logger = new Logger('JournalAnomalyLlmRule');

  /** LLM 呼び出しに含める仕訳の最大件数 (これを超えるとフィルタを更に厳しくする) */
  private readonly MAX_CANDIDATES = 80;
  /** 候補化する金額の最小値 */
  private readonly LARGE_AMOUNT = 500_000;
  /** 候補化する曖昧キーワード */
  private readonly SUSPICIOUS_KEYWORDS = [
    '調整',
    '仮計上',
    '修正',
    '振替',
    '諸口',
    '不明',
    '仮',
    '預け',
    '一時',
    '雑',
  ];

  constructor(private httpService: HttpService) {}

  async detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]> {
    const provider = createLlmProvider(this.httpService);
    if (!provider) {
      this.logger.warn(
        'LLM provider not configured (ANTHROPIC_API_KEY / GOOGLE_AI_API_KEY missing). Skipping L3.',
      );
      return [];
    }

    const startDate = `${ctx.fiscalYear}-${String(ctx.month).padStart(2, '0')}-01`;
    const endObj = new Date(Date.UTC(ctx.fiscalYear, ctx.month, 0));
    const endDate = `${endObj.getUTCFullYear()}-${String(endObj.getUTCMonth() + 1).padStart(2, '0')}-${String(endObj.getUTCDate()).padStart(2, '0')}`;

    const journalsResp = await ctx.mfApi
      .getJournals(ctx.orgId, { startDate, endDate })
      .catch((err) => {
        this.logger.warn(`getJournals failed: ${err}`);
        return null;
      });
    const journals: Journal[] = Array.isArray(journalsResp?.journals)
      ? journalsResp.journals
      : [];
    if (journals.length === 0) return [];

    // 候補抽出: 曖昧キーワード or 大金額
    const candidates = journals.flatMap<Candidate>((j) => {
      const items = Array.isArray(j.items) ? j.items : [];
      return items.flatMap((item) => {
        const description = (j.description || item.description || '').toString();
        const amount = Number(item.amount || item.value || 0);
        const isSuspicious = this.SUSPICIOUS_KEYWORDS.some((kw) =>
          description.includes(kw),
        );
        const isLarge = amount >= this.LARGE_AMOUNT;
        if (!isSuspicious && !isLarge) return [];
        return [
          {
            id: (j.id || j.journal_id || '').toString(),
            date: (j.issue_date || j.journal_date || '').toString(),
            description,
            amount,
            account: (item.account_item_name || item.account_name || '').toString(),
            side: (item.entry_side || item.side || '').toString(),
            taxCategory: (item.tax_category || item.tax_code || '').toString(),
          },
        ];
      });
    });

    if (candidates.length === 0) {
      this.logger.log('L3: no suspicious candidates found, skipping LLM call');
      return [];
    }

    // 件数が多い場合は金額順に絞る
    const trimmed = candidates
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, this.MAX_CANDIDATES);

    const prompt = await this.buildPrompt(trimmed, ctx);
    const response = await provider
      .generate(prompt, { maxTokens: 4000, json: true })
      .catch((err) => {
        this.logger.warn(`LLM generate failed: ${err}`);
        return null;
      });
    if (!response?.text) return [];

    const findings = parseLlmResponse(response.text);
    if (!findings) {
      this.logger.warn('L3: LLM response failed to parse');
      return [];
    }

    return findings
      .filter((f) => f.title && f.body && f.recommended_action)
      .map<RiskFindingDraft>((f) => {
        const candidate = trimmed.find((c) => c.id === f.scope_key);
        const baseScore = clamp(f.risk_score ?? 50, 0, 100);
        const finalScore = candidate
          ? computeRiskScore(baseScore, candidate.amount)
          : baseScore;
        return {
          layer: RiskLayer.L3_LLM,
          ruleKey: this.key,
          scopeKey: f.scope_key || '',
          title: f.title.slice(0, 200),
          body: f.body.slice(0, 1500),
          riskScore: finalScore,
          flags: Array.isArray(f.flags) ? f.flags.slice(0, 8) : ['llm_detected'],
          evidence: {
            ...((f.evidence as Record<string, unknown>) ?? {}),
            candidateJournal: candidate ?? null,
            fiscalYear: ctx.fiscalYear,
            month: ctx.month,
            source: 'llm_journal_anomaly',
          },
          recommendedAction: f.recommended_action.slice(0, 1000),
        };
      });
  }

  private async buildPrompt(
    candidates: Candidate[],
    ctx: RiskRuleContext,
  ): Promise<string> {
    const period = formatPeriod(ctx.fiscalYear, ctx.month);
    const lines = candidates.map(
      (c, i) =>
        `${i + 1}. id=${c.id} 日付=${c.date} 科目=${c.account} 借貸=${c.side} 金額=${formatYen(c.amount)} 課税=${c.taxCategory || '不明'} 摘要=${c.description || '(なし)'}`,
    );

    // 会社情報を取得 (業種・HP URL・経営コンテキスト)
    const org = await ctx.prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { industry: true, websiteUrl: true, businessContext: true },
    });
    const companyInfoLines: string[] = [];
    if (org?.industry) companyInfoLines.push(`業種: ${org.industry}`);
    if (org?.websiteUrl) companyInfoLines.push(`HP: ${org.websiteUrl}`);
    if (org?.businessContext) {
      companyInfoLines.push(`経営コンテキスト:\n${org.businessContext}`);
    }
    const companyInfoBlock = companyInfoLines.length
      ? `\n【会社情報】\n${companyInfoLines.join('\n')}\n`
      : '';

    return `あなたは中小企業の会計事務所に常駐する AI CFO です。
${period} の仕訳明細から「気になる仕訳」を抽出してください。
${companyInfoBlock}
【候補仕訳 (摘要キーワード or 50 万円以上の金額でフィルタ済)】
${lines.join('\n')}

【判定基準】
1. 摘要が極端に曖昧で、内容を後から特定しにくいもの (例: 「調整」「諸口」だけ)
2. 同月内で同じ曖昧摘要が 3 件以上あり、月末調整で粉飾している兆候
3. 金額が大きく科目に対して不自然 (例: 雑費に 100 万円超)
4. 課税区分が科目の通常運用と矛盾する (例: 給料手当が課税仕入になっている)
5. 取引先名が摘要から読み取れない大金額の支出/収入

【出力形式】
以下の JSON 形式で返してください。findings は最大 10 件まで、本当に懸念のあるものだけ。
気になる点がなければ findings: [] で返してください。

{
  "findings": [
    {
      "scope_key": "<候補リストの id をそのまま>",
      "title": "<1 行サマリー、80 文字以内>",
      "body": "<200 文字以内、なぜ気になるか + 仕訳の特定情報>",
      "risk_score": <0-100 の整数>,
      "flags": ["<短いタグ、最大 4 個>"],
      "evidence": { <根拠データ> },
      "recommended_action": "<推奨アクション、200 文字以内>"
    }
  ]
}

【注意】
- 全候補を懸念扱いせず、本当に確認価値があるものだけ抽出してください。
- 推奨アクションは具体的に書いてください (例: 「補助科目を確認」「税区分を修正」「請求書添付を依頼」)。
- 通常の業務取引で問題のない仕訳は無視してください。
- 出力は JSON 1 つのみ。マークダウンや前置きは不要です。`;
  }
}

interface Candidate {
  id: string;
  date: string;
  description: string;
  amount: number;
  account: string;
  side: string;
  taxCategory: string;
}

interface Journal {
  id?: string;
  journal_id?: string;
  issue_date?: string;
  journal_date?: string;
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
  tax_category?: string;
  tax_code?: string;
}

interface LlmFinding {
  scope_key?: string;
  title?: string;
  body?: string;
  risk_score?: number;
  flags?: string[];
  evidence?: unknown;
  recommended_action?: string;
}

function parseLlmResponse(text: string): LlmFinding[] | null {
  // 純粋な JSON ならそのままパース。前後にマークダウンが付いている場合は { を探す
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { findings?: LlmFinding[] };
    if (!Array.isArray(obj?.findings)) return null;
    return obj.findings;
  } catch {
    return null;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
