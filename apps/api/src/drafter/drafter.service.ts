import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createLlmProvider } from '../ai/llm-provider';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { MonthlyCloseService } from '../monthly-close/monthly-close.service';
import { PrismaService } from '../prisma/prisma.service';
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
  kind: 'DRAFT';
  period: { fiscalYear: number | null; endMonth: number | null };
  sections: DrafterSection[];
  fallbackReason?: string;
}

type RunwayMode = 'worstCase' | 'netBurn' | 'actual';

type MonthlyContext = {
  targetMonth: string;
  revenue: number;
  grossProfit: number;
  sga: number;
  operatingProfit: number;
  ordinaryProfit: number;
  netIncome: number;
  cashBalance: number;
  runway: number;
  /** 主指標として使うモード（資金繰りページのトグル） */
  runwayMode: RunwayMode;
  /** 主指標の表示用ラベル */
  runwayLabel: string;
  /** 構造的アンカーとしての Net Burn 月数（divergence note 用） */
  runwayNetBurnMonths: number;
  trend: { month: string; revenue: number; operatingProfit: number }[];
};

const RUNWAY_LABELS: Record<RunwayMode, string> = {
  worstCase: 'Gross Burn(売上ゼロ最悪)',
  netBurn: 'Net Burn(構造的損失)',
  actual: 'Actual Burn(BS純減ベース)',
};

@Injectable()
export class DrafterService {
  private logger = new Logger('DrafterService');

  constructor(
    private http: HttpService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    private agentRuns: AgentRunsService,
    private monthlyClose: MonthlyCloseService,
    private prisma: PrismaService,
  ) {}

  /** 顧問先が原価計算を運用しているか（売上総利益率の信頼性） */
  private async getUsesCostAccounting(orgId: string): Promise<boolean> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { usesCostAccounting: true },
      });
      return !!org?.usesCostAccounting;
    } catch {
      return false;
    }
  }

  async generateMonthlyDraft(
    orgId: string,
    options?: { fiscalYear?: number; endMonth?: number; runwayMode?: RunwayMode },
  ): Promise<DrafterResponse> {
    const now = new Date();
    const startedAt = Date.now();

    const ctx = await this.safeMonthlyContext(orgId, options);
    const usesCostAccounting = await this.getUsesCostAccounting(orgId);
    const ruleSections = this.buildRuleSections(ctx, usesCostAccounting);

    const provider = createLlmProvider(this.http);
    if (!provider || !ctx) {
      const result: DrafterResponse = {
        generatedAt: now.toISOString(),
        kind: 'DRAFT',
        period: {
          fiscalYear: options?.fiscalYear ?? null,
          endMonth: options?.endMonth ?? null,
        },
        sections: ruleSections,
        fallbackReason: !ctx
          ? 'MF会計未連携のため定型テンプレートのみ提示'
          : 'LLM未設定のため定型テンプレートのみ提示',
      };
      await this.logDrafterRun(orgId, options, result, 'FALLBACK', Date.now() - startedAt);
      return result;
    }

    try {
      const prompt = this.buildPrompt(ctx, ruleSections, usesCostAccounting);
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

  /**
   * 単月分析用コンテキスト。
   * - 当月の単月P/L: transition PLの対象月列
   * - 月末残高系（現預金・ランウェイ）: trial balance BSから
   * - 月次推移: transition PL全体の実績月
   */
  private async safeMonthlyContext(
    orgId: string,
    options?: { fiscalYear?: number; endMonth?: number; runwayMode?: RunwayMode },
  ): Promise<MonthlyContext | null> {
    try {
      // MCPの並列呼び出しでセッション競合が起きるケースがあるため順次実行
      const transitionPl = await this.mfApi.getTransitionPL(orgId, options?.fiscalYear);
      const pl = await this.mfApi.getTrialBalancePL(orgId, options?.fiscalYear, options?.endMonth);
      const bs = await this.mfApi.getTrialBalanceBS(orgId, options?.fiscalYear, options?.endMonth);
      const bsT = await this.mfApi
        .getTransitionBS(orgId, options?.fiscalYear, options?.endMonth)
        .catch(() => null);
      const settledMonths = options?.fiscalYear
        ? await this.monthlyClose.getSettledMonths(orgId, options.fiscalYear)
        : undefined;
      const cashflowDerived =
        bsT && transitionPl
          ? this.mfTransform.deriveCashflow(bsT, transitionPl, bs, settledMonths)
          : undefined;
      const dashboardCum = this.mfTransform.buildDashboardSummary(pl, bs, cashflowDerived);

      const allPoints = this.mfTransform.transformTransitionPL(transitionPl);
      const series = (name: string) =>
        this.mfTransform.getAccountTransition(transitionPl, name);
      const revTrend = series('売上高合計');
      const cogsTrend = series('売上原価');
      const sgaTrend = series('販売費及び一般管理費合計');
      const opTrend = series('営業利益');
      const ordTrend = series('経常利益');
      const netTrend = series('当期純利益');

      // 「営業活動が動いた月」基準で実績判定（販管費が¥10万超 or 仕入原価あり）
      // MFは前受金取崩しの売上スケジュールを将来月にも入れてくるため、売上だけでは判定しない
      const isOperationallyActual = (i: number) => {
        const sga = sgaTrend[i]?.amount ?? 0;
        const cogs = cogsTrend[i]?.amount ?? 0;
        return sga > 100_000 || cogs > 0;
      };
      const lastOperationalIdx = (() => {
        for (let i = allPoints.length - 1; i >= 0; i--) {
          if (isOperationallyActual(i)) return i;
        }
        return -1;
      })();
      const targetLabel = options?.endMonth
        ? `${options.endMonth}月`
        : lastOperationalIdx >= 0
          ? allPoints[lastOperationalIdx].month
          : allPoints[0]?.month ?? '';
      const targetIdx = allPoints.findIndex((p) => p.month === targetLabel);
      // 対象月までの実績のみ（翌月以降は AI に渡さない）
      const actualTrend = allPoints
        .slice(0, targetIdx >= 0 ? targetIdx + 1 : allPoints.length)
        .filter((_, i) => isOperationallyActual(i));

      const at = (arr: { month: string; amount: number }[]) =>
        arr.find((p) => p.month === targetLabel)?.amount ?? 0;

      // 主指標は資金繰りページのトグル(options.runwayMode)に揃える
      const runwayMode: RunwayMode = options?.runwayMode ?? 'netBurn';
      const variants = cashflowDerived?.runway.variants;
      const primaryVariant = variants?.[runwayMode];
      const netBurnVariant = variants?.netBurn;
      const primaryMonths = primaryVariant?.months ?? dashboardCum.runway;
      const netBurnMonths = netBurnVariant?.months ?? dashboardCum.runway;

      return {
        targetMonth: targetLabel,
        revenue: at(revTrend),
        grossProfit: at(revTrend) - at(cogsTrend),
        sga: at(sgaTrend),
        operatingProfit: at(opTrend),
        ordinaryProfit: at(ordTrend),
        netIncome: at(netTrend),
        cashBalance: dashboardCum.cashBalance,
        runway: primaryMonths,
        runwayMode,
        runwayLabel: RUNWAY_LABELS[runwayMode],
        runwayNetBurnMonths: netBurnMonths,
        trend: actualTrend,
      };
    } catch (err) {
      this.logger.warn(
        `Drafter monthly context fetch failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private buildRuleSections(
    d: MonthlyContext | null,
    usesCostAccounting: boolean = false,
  ): DrafterSection[] {
    if (!d) {
      return [
        {
          heading: '当月の業績サマリー',
          body: '(MF会計未連携のため自動生成未実施。顧問による手入力が必要)',
          evidence: { source: 'ドラフト(雛形)', confidence: 'LOW', premise: 'データ未取得' },
        },
        {
          heading: 'リスクと注目点',
          body: '(データ未連携のため記載なし)',
          evidence: { source: 'ドラフト(雛形)', confidence: 'LOW', premise: 'データ未取得' },
        },
        {
          heading: '過去からの推移',
          body: '(データ未連携のため記載なし)',
          evidence: { source: 'ドラフト(雛形)', confidence: 'LOW', premise: 'データ未取得' },
        },
        {
          heading: '次月に向けた提案',
          body: '(データ未連携のため記載なし)',
          evidence: { source: 'ドラフト(雛形)', confidence: 'LOW', premise: 'データ未取得' },
        },
      ];
    }

    const opMarginPct = d.revenue > 0 ? (d.operatingProfit / d.revenue) * 100 : 0;
    const monthTag = d.targetMonth || '当月';
    const targetIdx = d.trend.findIndex((p) => p.month === d.targetMonth);
    const prev = targetIdx > 0 ? d.trend[targetIdx - 1] : null;
    const pastMonths = targetIdx > 0 ? d.trend.slice(0, targetIdx) : [];
    const pastAvgRev =
      pastMonths.length > 0
        ? pastMonths.reduce((s, p) => s + p.revenue, 0) / pastMonths.length
        : 0;
    const pastAvgOp =
      pastMonths.length > 0
        ? pastMonths.reduce((s, p) => s + p.operatingProfit, 0) / pastMonths.length
        : 0;

    // 主指標は資金繰りページの選択モードに合わせる。Net Burn と乖離があればアンカー併記
    const runwayMonthsTxt = Number.isFinite(d.runway) ? `${d.runway}ヶ月` : '—';
    const netBurnMonthsTxt = Number.isFinite(d.runwayNetBurnMonths)
      ? `${d.runwayNetBurnMonths}ヶ月`
      : '—';
    const showNetBurnAnchor =
      d.runwayMode !== 'netBurn' &&
      Number.isFinite(d.runway) &&
      Number.isFinite(d.runwayNetBurnMonths) &&
      Math.abs(d.runwayNetBurnMonths - d.runway) >= 3;

    // 原価計算未運用なら売上総利益（粗利）には触れない。営業利益基準で語る。
    const summaryFirstLine = usesCostAccounting
      ? `${monthTag}単月の売上高 ${formatYen(d.revenue)}、売上総利益 ${formatYen(d.grossProfit)}、販管費 ${formatYen(d.sga)}。`
      : `${monthTag}単月の売上高 ${formatYen(d.revenue)}、販管費 ${formatYen(d.sga)}（原価計算未運用のため売上総利益は省略）。`;

    return [
      {
        heading: `${monthTag}の業績サマリー`,
        body: [
          summaryFirstLine,
          `${monthTag}単月の営業利益 ${formatYen(d.operatingProfit)}(営業利益率 ${opMarginPct.toFixed(1)}%)、経常利益 ${formatYen(d.ordinaryProfit)}、当期純利益 ${formatYen(d.netIncome)}。`,
          `月末時点の現預金残高 ${formatYen(d.cashBalance)}、${d.runwayLabel} 基準のランウェイ ${runwayMonthsTxt}${showNetBurnAnchor ? `（構造的アンカー Net Burn 基準では ${netBurnMonthsTxt}）` : ''}。`,
        ].join('\n'),
        evidence: {
          source: 'MF会計 推移表(対象月の単月列)+ 試算表BS(月末残高)',
          confidence: 'HIGH',
          premise: `主指標は資金繰りページの選択モード(${d.runwayMode})。現預金・ランウェイは月末時点の残高`,
        },
      },
      {
        heading: 'リスクと注目点',
        body:
          d.runway < 6
            ? `${d.runwayLabel} 基準のランウェイが${runwayMonthsTxt}と6ヶ月を下回ります。${showNetBurnAnchor ? `構造的体力(Net Burn)では${netBurnMonthsTxt}。` : ''}資金調達またはコスト構造の見直しを早期に検討する必要があります。`
            : d.operatingProfit < 0
              ? `${monthTag}単月は営業赤字 ${formatYen(d.operatingProfit)}です。赤字要因の分解と改善策の優先順位付けが必要です。`
              : '現時点で大きな資金リスクは検出されていません。次月も営業利益率とランウェイの推移を観察します。',
        evidence: {
          source: 'MF会計 推移表から算出',
          confidence: 'MEDIUM',
          premise: `主指標は ${d.runwayMode}。単月値とランウェイ試算から導出`,
        },
      },
      {
        heading: '過去からの推移',
        body: prev
          ? [
              `売上は前月(${prev.month} ${formatYen(prev.revenue)})比で${d.revenue >= prev.revenue ? '増加' : '減少'}。${monthTag}は${formatYen(d.revenue)}。`,
              `営業利益は前月(${prev.month} ${formatYen(prev.operatingProfit)})比で${d.operatingProfit >= prev.operatingProfit ? '改善' : '悪化'}。${monthTag}は${formatYen(d.operatingProfit)}。`,
              pastMonths.length > 0
                ? `${monthTag}以前の月平均: 売上${formatYen(Math.round(pastAvgRev))} / 営業利益${formatYen(Math.round(pastAvgOp))}。`
                : '',
            ]
              .filter(Boolean)
              .join('\n')
          : '当期最初の実績月のため、過去月との比較はありません。',
        evidence: {
          source: 'MF会計 推移表(当期全月)',
          confidence: 'MEDIUM',
          premise: '単月の時系列比較',
        },
      },
      {
        heading: '次月に向けた提案(ドラフト)',
        body:
          '(ドラフト)営業利益率・ランウェイ・債権回収の3点を重点指標として次月モニタリング。特に売上上位取引先の回収サイト変化と、固定費の前年同期比の確認を推奨します。',
        evidence: {
          source: 'ドラフト提案',
          confidence: 'LOW',
          premise: '顧問による編集を前提。実行判断は顧問の責任',
        },
      },
    ];
  }

  private buildPrompt(
    d: MonthlyContext,
    ruleSections: DrafterSection[],
    usesCostAccounting: boolean = false,
  ): string {
    const monthTag = d.targetMonth || '当月';
    const trendLines = d.trend
      .map(
        (p) =>
          `${p.month}: 売上 ${formatYen(p.revenue)} / 営業利益 ${formatYen(p.operatingProfit)}`,
      )
      .join('\n');
    // 原価計算未運用なら売上総利益はプロンプトから外す（LLM が触らないように）
    const dataBlock = [
      `${monthTag}単月`,
      `売上高: ${formatYen(d.revenue)}`,
      ...(usesCostAccounting ? [`売上総利益: ${formatYen(d.grossProfit)}`] : []),
      `販管費: ${formatYen(d.sga)}`,
      `営業利益: ${formatYen(d.operatingProfit)}`,
      `経常利益: ${formatYen(d.ordinaryProfit)}`,
      `当期純利益: ${formatYen(d.netIncome)}`,
      `月末現預金: ${formatYen(d.cashBalance)}`,
      `ランウェイ(Net Burn基準): ${Number.isFinite(d.runway) ? `${d.runway}ヶ月` : '—'}`,
    ].join('\n');

    const policyLines = usesCostAccounting
      ? []
      : [
          '【顧問先ポリシー（厳守）】',
          '- この顧問先は原価計算を運用していないため、**売上総利益（粗利）には触れない**。',
          '- 「粗利」「売上総利益率」「売上原価」を分析の主軸に置かない。',
          '- 収益性は **営業利益 / 営業利益率** ベースで語る。販管費を売上で吸収できているかを軸に書く。',
        ];

    return [
      'あなたはSevenBoardのAI CFOレポート生成エンジン(drafter)です。',
      `顧問による編集を前提とした「${monthTag}単月の分析レポート」の初稿を日本語で作成します。`,
      '【厳守事項】',
      '- 累計ではなく、対象月の単月値を主題に語る。累計表現は使わない。',
      '- 断定表現は避け、「ドラフト」「仮」等のラベルを維持する。',
      '- 推測や一般論は書かない。与えられた数値から直接導ける範囲に留める。',
      '- 各セクションは3〜5文で簡潔に。',
      '- JSONのみ出力。形式: {"sections":[{"heading":"...","body":"..."}]}',
      '- セクション数とheadingの並び順は以下に従うこと:',
      ...ruleSections.map((s, i) => `  ${i + 1}. ${s.heading}`),
      ...(policyLines.length ? ['', ...policyLines] : []),
      '',
      `--- ${monthTag}単月データ(主題) ---`,
      dataBlock,
      '',
      '--- 過去からの月次推移(比較用の文脈、主題ではない) ---',
      trendLines,
      '',
      '--- 雛形(必要に応じて参考、数値は上記を優先) ---',
      ruleSections.map((s, i) => `### ${i + 1}. ${s.heading}\n${s.body}`).join('\n\n'),
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
