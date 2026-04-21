import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createLlmProvider } from '../ai/llm-provider';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import type { AgentRunStatus } from '@prisma/client';

export interface DrafterSection {
  heading: string;
  body: string;
  evidence: {
    source: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    premise: string;
  };
}

export interface DrafterResponse {
  generatedAt: string;
  /** 顧問の編集が前提であることを示すラベル */
  kind: 'DRAFT';
  period: { fiscalYear: number | null; endMonth: number | null };
  sections: DrafterSection[];
  fallbackReason?: string;
}

@Injectable()
export class DrafterService {
  private logger = new Logger('DrafterService');

  constructor(
    private http: HttpService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    private agentRuns: AgentRunsService,
  ) {}

  async generateMonthlyDraft(
    orgId: string,
    options?: { fiscalYear?: number; endMonth?: number },
  ): Promise<DrafterResponse> {
    const now = new Date();
    const startedAt = Date.now();

    const dashboard = await this.safeDashboard(orgId, options);
    const ruleSections = this.buildRuleSections(dashboard);

    const provider = createLlmProvider(this.http);
    if (!provider || !dashboard) {
      const result: DrafterResponse = {
        generatedAt: now.toISOString(),
        kind: 'DRAFT',
        period: {
          fiscalYear: options?.fiscalYear ?? null,
          endMonth: options?.endMonth ?? null,
        },
        sections: ruleSections,
        fallbackReason: !dashboard
          ? 'MF会計未連携のため定型テンプレートのみ提示'
          : 'LLM未設定のため定型テンプレートのみ提示',
      };
      await this.logDrafterRun(orgId, options, result, 'FALLBACK', Date.now() - startedAt);
      return result;
    }

    try {
      const prompt = this.buildPrompt(dashboard, ruleSections);
      const res = await provider.generate(prompt, {
        maxTokens: 1800,
        json: true,
      });
      const parsed = safeParseSections(res.text);
      if (parsed && parsed.length > 0) {
        const merged = ruleSections.map((rule, i) => {
          const llm = parsed[i];
          if (!llm) return rule;
          return {
            heading: llm.heading || rule.heading,
            body: llm.body || rule.body,
            evidence: rule.evidence,
          };
        });
        const result: DrafterResponse = {
          generatedAt: now.toISOString(),
          kind: 'DRAFT',
          period: {
            fiscalYear: options?.fiscalYear ?? null,
            endMonth: options?.endMonth ?? null,
          },
          sections: merged,
        };
        await this.logDrafterRun(orgId, options, result, 'SUCCESS', Date.now() - startedAt);
        return result;
      }
    } catch (err) {
      this.logger.warn(
        `Drafter LLM generation failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    const fallback: DrafterResponse = {
      generatedAt: now.toISOString(),
      kind: 'DRAFT',
      period: {
        fiscalYear: options?.fiscalYear ?? null,
        endMonth: options?.endMonth ?? null,
      },
      sections: ruleSections,
    };
    await this.logDrafterRun(orgId, options, fallback, 'FALLBACK', Date.now() - startedAt);
    return fallback;
  }

  private async logDrafterRun(
    orgId: string,
    options: { fiscalYear?: number; endMonth?: number } | undefined,
    result: DrafterResponse,
    status: AgentRunStatus,
    durationMs: number,
  ) {
    await this.agentRuns.logRun({
      orgId,
      agentKey: 'DRAFTER',
      mode: 'OBSERVE',
      fiscalYear: options?.fiscalYear ?? null,
      endMonth: options?.endMonth ?? null,
      input: { fiscalYear: options?.fiscalYear ?? null, endMonth: options?.endMonth ?? null },
      output: result as unknown as Record<string, unknown>,
      status,
      durationMs,
    });
  }

  private async safeDashboard(
    orgId: string,
    options?: { fiscalYear?: number; endMonth?: number },
  ): Promise<{
    revenue: number;
    operatingProfit: number;
    ordinaryProfit: number;
    netIncome: number;
    cashBalance: number;
    runway: number;
    periodStart: string;
    periodEnd: string;
  } | null> {
    try {
      const [pl, bs] = await Promise.all([
        this.mfApi.getTrialBalancePL(orgId, options?.fiscalYear, options?.endMonth),
        this.mfApi.getTrialBalanceBS(orgId, options?.fiscalYear, options?.endMonth),
      ]);
      const d = this.mfTransform.buildDashboardSummary(pl, bs);
      return {
        revenue: d.revenue,
        operatingProfit: d.operatingProfit,
        ordinaryProfit: d.ordinaryProfit,
        netIncome: d.netIncome,
        cashBalance: d.cashBalance,
        runway: d.runway,
        periodStart: d.period.start,
        periodEnd: d.period.end,
      };
    } catch (err) {
      this.logger.warn(
        `Drafter dashboard fetch failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private buildRuleSections(
    d: {
      revenue: number;
      operatingProfit: number;
      ordinaryProfit: number;
      netIncome: number;
      cashBalance: number;
      runway: number;
      periodStart: string;
      periodEnd: string;
    } | null,
  ): DrafterSection[] {
    if (!d) {
      return [
        {
          heading: '業績サマリー',
          body: '（MF会計未連携のため自動生成未実施。顧問による手入力が必要）',
          evidence: {
            source: 'ドラフト(雛形)',
            confidence: 'LOW',
            premise: 'データ未取得',
          },
        },
        {
          heading: 'リスクと注目点',
          body: '（データ未連携のため記載なし）',
          evidence: {
            source: 'ドラフト(雛形)',
            confidence: 'LOW',
            premise: 'データ未取得',
          },
        },
        {
          heading: '次月に向けた提案',
          body: '（データ未連携のため記載なし）',
          evidence: {
            source: 'ドラフト(雛形)',
            confidence: 'LOW',
            premise: 'データ未取得',
          },
        },
      ];
    }
    const opMarginPct = d.revenue > 0 ? (d.operatingProfit / d.revenue) * 100 : 0;
    return [
      {
        heading: '業績サマリー',
        body: [
          `期間: ${d.periodStart} 〜 ${d.periodEnd}`,
          `売上高 ${formatYen(d.revenue)}、営業利益 ${formatYen(d.operatingProfit)}（営業利益率 ${opMarginPct.toFixed(1)}%）、経常利益 ${formatYen(d.ordinaryProfit)}、当期純利益 ${formatYen(d.netIncome)}。`,
          `現預金残高 ${formatYen(d.cashBalance)}、想定ランウェイ ${Number.isFinite(d.runway) ? `${d.runway}ヶ月` : '—'}。`,
        ].join('\n'),
        evidence: {
          source: 'MF会計 試算表（PL/BS）',
          confidence: 'HIGH',
          premise: '試算表の月次締め値を確定値として扱う',
        },
      },
      {
        heading: 'リスクと注目点',
        body:
          d.runway < 6
            ? `ランウェイが${d.runway}ヶ月と6ヶ月を下回ります。資金調達またはコスト構造の見直しを早期に検討する必要があります。`
            : '現時点で大きな資金リスクは検出されていません。直近の営業利益率と債権回転の推移を次月以降も観察します。',
        evidence: {
          source: 'MF会計 試算表から算出',
          confidence: 'MEDIUM',
          premise: '単月スナップショットに基づく概観。詳細は推移表で検証が必要',
        },
      },
      {
        heading: '次月に向けた提案（ドラフト）',
        body:
          '（ドラフト）営業利益率・ランウェイ・債権回収の3点を重点指標として次月モニタリング。特に売上上位取引先の回収サイト変化と、固定費の前年同期比の確認を推奨します。',
        evidence: {
          source: 'ドラフト提案',
          confidence: 'LOW',
          premise: '顧問による編集を前提。実行判断は顧問の責任',
        },
      },
    ];
  }

  private buildPrompt(
    d: {
      revenue: number;
      operatingProfit: number;
      ordinaryProfit: number;
      netIncome: number;
      cashBalance: number;
      runway: number;
      periodStart: string;
      periodEnd: string;
    },
    ruleSections: DrafterSection[],
  ): string {
    const dataBlock = [
      `期間: ${d.periodStart}〜${d.periodEnd}`,
      `売上高: ${formatYen(d.revenue)}`,
      `営業利益: ${formatYen(d.operatingProfit)}`,
      `経常利益: ${formatYen(d.ordinaryProfit)}`,
      `当期純利益: ${formatYen(d.netIncome)}`,
      `現預金: ${formatYen(d.cashBalance)}`,
      `ランウェイ: ${Number.isFinite(d.runway) ? `${d.runway}ヶ月` : '—'}`,
    ].join('\n');

    return [
      'あなたはSevenBoardの「drafter」エージェントです。',
      '顧問による編集を前提としたレポート初稿を日本語で作成します。',
      '【厳守事項】',
      '- 断定表現は避け、常に「ドラフト」「仮」等のラベルを維持する。',
      '- 推測や一般論は書かない。与えられた数値から直接導ける範囲に留める。',
      '- 各セクションは3〜5文で簡潔に。',
      '- JSONのみ出力。形式: {"sections":[{"heading":"...","body":"..."}]}',
      '- セクション数とheadingの並び順は以下に従うこと:',
      ...ruleSections.map((s, i) => `  ${i + 1}. ${s.heading}`),
      '',
      '--- 当月データ ---',
      dataBlock,
      '',
      '--- 雛形（必要に応じて参考、数値は上記を優先）---',
      ruleSections
        .map((s, i) => `### ${i + 1}. ${s.heading}\n${s.body}`)
        .join('\n\n'),
    ].join('\n');
  }
}

function formatYen(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const man = Math.round(n / 10000);
  return `${man.toLocaleString('ja-JP')}万円`;
}

function safeParseSections(
  raw: string,
): Array<{ heading: string; body: string }> | null {
  try {
    const trimmed = raw.trim().replace(/^```json\s*|```$/g, '');
    const obj = JSON.parse(trimmed);
    if (!obj || !Array.isArray(obj.sections)) return null;
    return obj.sections
      .filter((s: unknown): s is { heading: string; body: string } => {
        if (typeof s !== 'object' || s === null) return false;
        const o = s as Record<string, unknown>;
        return typeof o.heading === 'string' && typeof o.body === 'string';
      })
      .slice(0, 5);
  } catch {
    return null;
  }
}
