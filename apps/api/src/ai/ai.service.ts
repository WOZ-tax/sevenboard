import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { KintoneApiService } from '../kintone/kintone-api.service';
import { MonthlyCloseService } from '../monthly-close/monthly-close.service';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardSummary, FinancialStatementRow } from '../mf/types/mf-api.types';
import { createLlmProvider, extractJson, LlmProvider } from './llm-provider';

export interface AiHighlight {
  type: 'positive' | 'negative' | 'warning' | 'neutral';
  text: string;
}

export interface AiSectionItem {
  title: string;
  content: string;
}

export interface AiMonthlyTrendPoint {
  month: string;
  revenue: number;
  operatingProfit: number;
  /** その月に実績データがあるか（未来月・未入力月は false） */
  actual: boolean;
}

export interface AiSummaryResponse {
  summary: string;
  sections?: AiSectionItem[];
  highlights: AiHighlight[];
  /** 分析の主軸となる単月（例: "3月"）。未指定時は推移の最新実績月 */
  targetMonth?: string;
  /** 当月の単月財務データ（プロンプト透明性のためレスポンスにも返す） */
  targetMonthData?: {
    month: string;
    revenue: number;
    grossProfit: number;
    sga: number;
    operatingProfit: number;
    ordinaryProfit: number;
  };
  /** 過去からの月次推移（実績のある月のみ） */
  monthlyTrend?: AiMonthlyTrendPoint[];
  generatedAt: string;
}

export interface TalkScriptSection {
  /** ステップタイトル（例: "ステップ1: 前月業績報告（売上ハイライト）"） */
  title: string;
  /** 使用資料の明示（例: "売上高3期比較表"）。無ければ省略 */
  material?: string;
  /** 担当者の発言。具体的な数字を含んだ会話調 */
  content: string;
  /** 社長への【ヒアリング】質問リスト（複数） */
  hearings?: string[];
  /** 社長の想定反応例 */
  anticipatedResponses?: string[];
  /** 【提案・アクション設定】具体アクションの提案 */
  proposals?: string[];
  /** 想定Q&A */
  qa?: { q: string; a: string }[];
}

export interface TalkScript {
  /** 本日の目的共有（導入） */
  opening: string;
  /** 5ステップで構成された本編 */
  sections: TalkScriptSection[];
  /** 結び（次回までの宿題・お互いのアクション確認を含む） */
  closing: string;
  /** 次回までの宿題（担当者側） */
  nextActionsForAdvisor?: string[];
  /** 次回までの宿題（経営者側） */
  nextActionsForExecutive?: string[];
  generatedAt: string;
}

export interface BudgetScenario {
  name: string; // "Base" | "Upside" | "Downside"
  description: string;
  revenue: number;
  operatingProfit: number;
  assumptions: string[];
}

export interface FundingOption {
  /** 例: "銀行借入(運転資金)", "リース", "エクイティ" */
  type: string;
  /** 調達想定額（円） */
  amount: number;
  /** なぜこの金額か、どういう前提か */
  rationale: string;
  /** 融資シミュ用プリセット（LLMが借入タイプを想定したとき） */
  suggestedRate?: number;    // 年率 %
  suggestedMonths?: number;  // 返済月数
  repaymentType?: "EQUAL_INSTALLMENT" | "EQUAL_PRINCIPAL" | "BULLET";
}

/**
 * 財務指標 AI CFO 解説のレスポンス。
 * 安全性 / 収益性 / 効率性 の 3 カテゴリに分けて、CFO 目線で 2-3 文ずつ解説する。
 */
export interface IndicatorsCommentaryCategory {
  /** 表示順固定: '安全性' | '収益性' | '効率性' */
  name: '安全性' | '収益性' | '効率性';
  /** 全体感を一言で。UI でバッジ表示する想定 */
  level: 'good' | 'caution' | 'warning';
  /** カテゴリの状態を 2-3 文で説明 */
  summary: string;
  /** 経営上の打ち手 1-2 文 */
  advice: string;
}

export interface IndicatorsCommentaryResponse {
  /** カテゴリ別解説（順序固定） */
  categories: IndicatorsCommentaryCategory[];
  /** 1-2 文の総評。社長に最初に伝える要点 */
  overallSummary: string;
  /** 解析に使った主要数値（プロンプト透明性用） */
  inputs: {
    currentRatio: number;
    equityRatio: number;
    debtEquityRatio: number;
    grossProfitMargin: number;
    operatingProfitMargin: number;
    roe: number;
    roa: number;
    totalAssetTurnover: number;
    receivablesTurnover: number;
  };
  generatedAt: string;
  /** LLM 未設定 / エラー時のフォールバック理由（あれば表示） */
  fallbackReason?: string;
}

export interface FundingReport {
  executiveSummary: string;
  financialHighlights: string[];
  strengthsRisks: { strengths: string[]; risks: string[] };
  projections: string;
  /** 具体的な資金調達オプション（融資シミュへ引き継げる） */
  suggestedOptions?: FundingOption[];
  /** レポート再生成時にユーザーが検討中のシナリオ（フロントから送られた借入試算） */
  echoedScenarios?: Array<{
    name: string;
    principal: number;
    monthlyPayment: number;
    totalInterest: number;
  }>;
  generatedAt: string;
}

// ==========================================
// AIサマリーの focus（フォーカスしたい点）プロンプト定義
// ==========================================
type AiFocus = 'all' | 'revenue' | 'cost' | 'cashflow' | 'indicators';

const FOCUS_INSTRUCTION: Record<AiFocus, string> = {
  all: '5つのセクション（損益/資金繰り/良い兆し/注意点/次の打ち手）でバランス良く分析してください。',
  revenue:
    '今回は「売上・利益」に焦点を絞って分析してください。売上の構成、成長率、粗利率、上位顧客や案件の集中度、再現性のある売上か一時的な売上か、を深掘りしてください。資金繰りや費用の話題は最小限に。',
  cost: '今回は「費用」に焦点を絞って分析してください。販管費の内訳（人件費/外注費/広告費/家賃/システム費/その他）、固定費と変動費の分離、前年同期比の費目別変動、削減余地のある費目を深掘りしてください。売上や資金繰りの話題は最小限に。',
  cashflow:
    '今回は「キャッシュフロー」に焦点を絞って分析してください。現預金推移、ランウェイ、運転資金（売掛・買掛のサイト）、納税月のキャッシュアウト、追加資金調達の要否を深掘りしてください。損益や費用構造の話題は最小限に。',
  indicators:
    '今回は「財務指標」に焦点を絞って分析してください。自己資本比率、流動比率、ギアリング比率、売上高営業利益率、ROA、債務償還年数、回転率を業界目安と比較しながら深掘りしてください。',
};

const FOCUS_SECTIONS: Record<AiFocus, string[]> = {
  all: ['損益', '資金繰りとランウェイ', '良い兆し', '注意点', '次の打ち手'],
  revenue: [
    '売上構成と成長率',
    '利益率の推移',
    '上位顧客・案件の集中度',
    '再現性の評価',
    '売上拡大の論点',
  ],
  cost: [
    '販管費の内訳と推移',
    '固定費と変動費の分離',
    '主要費目の前年比',
    '削減余地のある費目',
    'コスト最適化の論点',
  ],
  cashflow: [
    '現預金推移とランウェイ',
    '運転資金（AR/AP/在庫）',
    '今後のキャッシュアウト（納税・賞与等）',
    '追加資金調達の要否',
    'CF改善の論点',
  ],
  indicators: [
    '安全性（流動比率・自己資本比率）',
    '収益性（売上高利益率・ROA）',
    'レバレッジ（ギアリング・債務償還年数）',
    '効率性（回転率）',
    '改善優先順位',
  ],
};

/**
 * Streaming AI summary に server から送るイベントの型。
 * SSE 経由でフロントへ。
 */
export type AiSummaryStreamEvent =
  | { type: 'phase'; phase: 'fetching-data' | 'building-context' | 'generating' }
  | { type: 'summary-chunk'; text: string }
  | { type: 'final'; payload: AiSummaryResponse }
  | { type: 'error'; message: string };

const SUMMARY_END_MARKER = '===STRUCTURED===';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private llm: LlmProvider | null;

  constructor(
    private httpService: HttpService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    private kintoneApi: KintoneApiService,
    private monthlyClose: MonthlyCloseService,
    private prisma: PrismaService,
  ) {
    this.llm = createLlmProvider(httpService);
  }

  private ensureLlm(): LlmProvider {
    if (!this.llm) {
      // Retry in case env vars were set after init
      this.llm = createLlmProvider(this.httpService);
    }
    if (!this.llm) {
      throw new Error(
        'AI機能を使用するにはANTHROPIC_API_KEY（Claude）またはGOOGLE_AI_API_KEY（Gemini）の設定が必要です',
      );
    }
    return this.llm;
  }

  private async getFinancialContext(orgId: string, fiscalYear?: number, endMonth?: number) {
    // MCP並列呼び出しでセッション競合/エラーが起きるため順次実行
    const pl = await this.mfApi.getTrialBalancePL(orgId, fiscalYear, endMonth);
    const bs = await this.mfApi.getTrialBalanceBS(orgId, fiscalYear, endMonth);
    // 推移表も取得して cashflowDerived を組み立て、AI レポートの主指標を資金繰りページの選択モードに揃える
    // （deriveCashflow が variants を返すので、formatBurnContextForPrompt 側で userMode に応じた主指標を出す）
    const bsT = await this.mfApi
      .getTransitionBS(orgId, fiscalYear, endMonth)
      .catch(() => null);
    const plT = await this.mfApi
      .getTransitionPL(orgId, fiscalYear, endMonth)
      .catch(() => null);
    // 締め済み月（IN_REVIEW/CLOSED）を burn 計算の active 月として尊重
    const settledMonths = fiscalYear
      ? await this.monthlyClose.getSettledMonths(orgId, fiscalYear)
      : undefined;
    const cashflowDerived =
      bsT && plT
        ? this.mfTransform.deriveCashflow(bsT, plT, bs, settledMonths)
        : undefined;
    const dashboard = this.mfTransform.buildDashboardSummary(pl, bs, cashflowDerived);
    const plRows = this.mfTransform.transformTrialBalancePL(pl);
    return { dashboard, plRows, pl, bs, cashflowDerived };
  }

  /**
   * 単月分析用のコンテキスト。
   * transition PL から対象月の単月値と、過去からの月次推移（実績のある月のみ）を返す。
   */
  private async getMonthlyContext(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ) {
    const transitionPl = await this.mfApi.getTransitionPL(orgId, fiscalYear);
    const allPoints = this.mfTransform.transformTransitionPL(transitionPl);

    // 対象月の決定: endMonth指定があればそれ、なければ「実績がある月」の最終月
    //   実績判定は revenue/op_profit ではなく PL に営業活動コストが計上されているかで行う
    //   (MF は前受金取崩しの売上スケジュールを将来月にも入れてくるので、それを「実績」と誤認しないため)
    const sgaTrendForActual = this.mfTransform.getAccountTransition(transitionPl, '販売費及び一般管理費合計');
    const cogsTrendForActual = this.mfTransform.getAccountTransition(transitionPl, '売上原価');
    // 非資金のみで構成される販管費（減価償却のみ等）は実績と見なさない閾値: 当月販管費が「決算非資金」の倍以上
    const isOperationallyActual = (i: number) => {
      const sga = sgaTrendForActual[i]?.amount ?? 0;
      const cogs = cogsTrendForActual[i]?.amount ?? 0;
      // 販管費が「百万円単位」（実態的な人件費・経費）or 仕入原価あり → 実績月
      return sga > 100_000 || cogs > 0;
    };
    const lastOperationalIdx = (() => {
      for (let i = allPoints.length - 1; i >= 0; i--) {
        if (isOperationallyActual(i)) return i;
      }
      return -1;
    })();
    const targetLabel = endMonth
      ? `${endMonth}月`
      : lastOperationalIdx >= 0
        ? allPoints[lastOperationalIdx].month
        : allPoints[0]?.month ?? '';
    const targetIdx = allPoints.findIndex((p) => p.month === targetLabel);

    // trend は「対象月までの実績月のみ」を返す（翌月以降は AI に渡さない）
    const trend: AiMonthlyTrendPoint[] = allPoints
      .slice(0, targetIdx >= 0 ? targetIdx + 1 : allPoints.length)
      .map((p, i) => ({
        month: p.month,
        revenue: p.revenue,
        operatingProfit: p.operatingProfit,
        // 実績フラグも「営業活動が動いた月」基準に揃える
        actual: isOperationallyActual(i),
      }));

    // 科目別の単月推移を取得し、対象月の値を抜き出す
    const series = (name: string) =>
      this.mfTransform.getAccountTransition(transitionPl, name);
    const revTrend = series('売上高合計');
    const cogsTrend = series('売上原価');
    const sgaTrend = series('販売費及び一般管理費合計');
    const opTrend = series('営業利益');
    const ordTrend = series('経常利益');

    const at = (arr: { month: string; amount: number }[]) =>
      arr.find((p) => p.month === targetLabel)?.amount ?? 0;

    const targetMonthData = {
      month: targetLabel,
      revenue: at(revTrend),
      grossProfit: at(revTrend) - at(cogsTrend),
      sga: at(sgaTrend),
      operatingProfit: at(opTrend),
      ordinaryProfit: at(ordTrend),
    };

    return { targetMonthData, trend };
  }

  /**
   * kintoneの顧客基本情報(appId:16)から業種・資本金・従業員数などを取得し、
   * LLMプロンプトに注入する「## 顧問先プロファイル」ブロックを組み立てる。
   * kintoneが未接続 or レコードなしなら空文字を返す（プロンプトには何も足さない）。
   */
  private async getCustomerProfileBlock(orgId: string): Promise<string> {
    try {
      const office = await this.mfApi.getOffice(orgId);
      const mfCode = (office as { code?: string } | undefined)?.code;
      if (!mfCode) return '';
      const customer = await this.kintoneApi.getCustomerBasicByMfCode(mfCode);
      if (!customer) return '';

      const lines: string[] = ['## 顧問先プロファイル（kintone 顧客基本情報）'];
      if (customer.clientName) lines.push(`- 会社名: ${customer.clientName}`);
      if (customer.industry) lines.push(`- 業種: ${customer.industry}`);
      if (customer.capital) lines.push(`- 資本金: ${customer.capital}`);
      if (customer.employees) lines.push(`- 従業員数: ${customer.employees}`);
      if (customer.establishedAt) lines.push(`- 設立: ${customer.establishedAt}`);
      if (customer.closingMonth) lines.push(`- 決算月: ${customer.closingMonth}`);
      if (customer.representativeName) lines.push(`- 代表者: ${customer.representativeName}`);
      if (customer.headOffice) lines.push(`- 本社所在地: ${customer.headOffice}`);
      if (customer.mainBanks?.length) lines.push(`- 取引銀行: ${customer.mainBanks.join(', ')}`);
      if (customer.contractStatusTax) lines.push(`- 契約状況(税務): ${customer.contractStatusTax}`);

      // 主要フィールドに拾えなかった情報を補う（上位10件）
      const extraKeys = Object.keys(customer.rawFields).filter(
        (k) =>
          ![
            '顧客ID', 'ルックアップ', 'クライアント名', '顧客名', '業種',
            '資本金', '従業員数', '設立年月日', '設立日', '決算月',
            '代表者', '代表者名', '本社所在地', '住所', '取引銀行',
            '契約状況(税務)', '契約状況税務',
          ].includes(k),
      );
      if (extraKeys.length > 0) {
        lines.push('- その他:');
        for (const k of extraKeys.slice(0, 10)) {
          lines.push(`  - ${k}: ${customer.rawFields[k]}`);
        }
      }

      lines.push(
        '※ 上記プロファイルを踏まえて、業種・規模に応じた観点で分析・提案してください。',
      );
      return lines.join('\n');
    } catch (err) {
      this.logger.warn(
        `Customer profile block skipped: ${err instanceof Error ? err.message : err}`,
      );
      return '';
    }
  }

  /**
   * 顧問先の分析ポリシー（原価計算運用フラグなど）をプロンプトに渡すブロック。
   *
   * usesCostAccounting=false（既定）の場合、売上総利益率は実態と乖離しがちなので
   * 「触れない / 営業利益基準で語る」と AI に明示する。中小企業では原価計算を
   * 実運用していないことが多く、grossProfitMargin が単に売上原価が紐付いていない
   * ことの結果になる可能性が高いため。
   */
  private async getOrgPolicyBlock(orgId: string): Promise<string> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { usesCostAccounting: true },
      });
      if (!org) return '';
      if (org.usesCostAccounting) {
        return [
          '## 解析方針',
          '- この顧問先は原価計算を運用しています。売上総利益率（売上総利益 / 売上）は信頼できる指標として扱ってください。',
        ].join('\n');
      }
      return [
        '## 解析方針（重要 / 厳守）',
        '- この顧問先は原価計算を運用していません。**売上総利益（粗利）には触れない**でください。',
        '- 「売上総利益率」「粗利」「Gross profit margin」「売上原価」を分析の主軸に置かない。読者が誤解する可能性があるため。',
        '- 収益性は **営業利益 / 営業利益率** ベースで語る。販管費を売上で吸収できているかを軸に分析する。',
        '- 業種比較や利益率比較を述べるときも、売上総利益ではなく営業利益で比較する。',
      ].join('\n');
    } catch (err) {
      this.logger.warn(
        `Org policy block skipped: ${err instanceof Error ? err.message : err}`,
      );
      return '';
    }
  }

  /** 原価計算フラグの素値だけ取得（プロンプト内分岐用） */
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

  private financialDataBlock(
    dashboard: DashboardSummary,
    plRows: FinancialStatementRow[],
    burnContext?: string,
  ): string {
    return `## 財務データ
- 売上高: ${dashboard.revenue}円
- 営業利益: ${dashboard.operatingProfit}円
- 経常利益: ${dashboard.ordinaryProfit}円
- 当期純利益: ${dashboard.netIncome}円
- 現預金残高: ${dashboard.cashBalance}円
- 総資産: ${dashboard.totalAssets}円
- 会計期間: ${dashboard.period.start} 〜 ${dashboard.period.end}

${burnContext ?? `- ランウェイ: ${dashboard.runway}ヶ月`}

## PL明細
${plRows.map((r) => `${r.category}: ${r.current}円`).join('\n')}`;
  }

  // =========================================
  // #既存: 月次AIサマリー
  // =========================================
  async generateMonthlySummary(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
    runwayMode?: 'worstCase' | 'netBurn' | 'actual',
    focus: 'all' | 'revenue' | 'cost' | 'cashflow' | 'indicators' = 'all',
  ): Promise<AiSummaryResponse> {
    // endMonth 未指定 = 全期間/通期モード
    if (endMonth === undefined || endMonth === null) {
      return this.generateCumulativeSummary(orgId, fiscalYear, runwayMode, focus);
    }

    const [{ targetMonthData, trend }, finCtx] = await Promise.all([
      this.getMonthlyContext(orgId, fiscalYear, endMonth),
      this.getFinancialContext(orgId, fiscalYear, endMonth).catch(() => null),
    ]);
    const burnContext = finCtx?.cashflowDerived
      ? this.mfTransform.formatBurnContextForPrompt(finCtx.cashflowDerived, runwayMode)
      : '';
    const primaryMode: 'worstCase' | 'netBurn' | 'actual' = runwayMode ?? 'netBurn';
    const primaryLabel: Record<typeof primaryMode, string> = {
      worstCase: 'Gross Burn(売上ゼロ最悪)',
      netBurn: 'Net Burn(構造的損失)',
      actual: 'Actual Burn(BS純減ベース)',
    };

    try {
      const llm = this.ensureLlm();
      const profileBlock = await this.getCustomerProfileBlock(orgId);
      const policyBlock = await this.getOrgPolicyBlock(orgId);
      const trendLines = trend
        .filter((p) => p.actual)
        .map((p) => `${p.month}: 売上 ${p.revenue.toLocaleString()}円 / 営業利益 ${p.operatingProfit.toLocaleString()}円`)
        .join('\n');
      const focusInstruction = FOCUS_INSTRUCTION[focus];
      const sectionTitles = FOCUS_SECTIONS[focus];
      const sectionsJsonTemplate = sectionTitles
        .map((t) => `{"title":"${t}","content":"このセクションのテーマに関する分析を 2-3 文で"}`)
        .join(',');
      const prompt = `あなたは中小企業のCFO代行として、顧問先の月次財務を経営者向けにわかりやすく分析する会計事務所の経営コンサルタントです。

以下は「${targetMonthData.month}単月」の財務データと、当期の月次推移です。

主題はあくまで「${targetMonthData.month}単月の分析」です。
過去からの推移は、${targetMonthData.month}の状態を理解するための比較材料として扱ってください。
累計ではなく、単月実績をベースに語ってください。

【今回のフォーカス】
${focusInstruction}

分析の目的は、経営者が「今月の状態」「資金繰り上の危険度」「次に取るべき打ち手」を短時間で把握できるようにすることです。
大企業向けの高度な財務理論や過度な専門用語は避け、中小企業のCFOが社長に説明するような実務的なトーンにしてください。
${profileBlock ? '\n' + profileBlock + '\n※ 上記プロファイルを踏まえ、業種・規模を断定しすぎず、読み取れる範囲で中小企業・スタートアップ寄りの観点から分析してください。\n※ 不明な情報は推測しすぎず、「確認したい論点」として自然に触れてください。\n' : ''}
${policyBlock ? '\n' + policyBlock + '\n' : ''}
## ${targetMonthData.month}単月の財務データ

- 売上高: ${targetMonthData.revenue.toLocaleString()}円
- 売上総利益: ${targetMonthData.grossProfit.toLocaleString()}円
- 販管費: ${targetMonthData.sga.toLocaleString()}円
- 営業利益: ${targetMonthData.operatingProfit.toLocaleString()}円
- 経常利益: ${targetMonthData.ordinaryProfit.toLocaleString()}円

${burnContext}

## 過去からの月次推移（単月実績のみ）

${trendLines}

## 分析方針

${targetMonthData.month}単月の売上、販管費、営業利益、経常利益、ランウェイを中心に分析してください。
直近数ヶ月の改善トレンドには触れてよいですが、主語は常に「${targetMonthData.month}」に置いてください。
「過去から改善しているので安心」ではなく、「${targetMonthData.month}は赤字幅が縮小したが、まだ販管費を売上で吸収しきれていない」というように、当月の経営判断につながる表現にしてください。

特に以下の観点を含めてください。

1. ${targetMonthData.month}単月の損益状況
売上に対する販管費の関係、営業利益・経常利益の水準を踏まえ、固定費を売上で吸収できているかという観点で分析してください。

2. 資金繰りとランウェイ
主指標は **${primaryLabel[primaryMode]}** ベースのランウェイです（資金繰りページでユーザーが選択中のモードに合わせています）。現預金水準と比較してください。
${primaryMode === 'actual'
  ? 'Actual Burn は AR 回収や前受金取崩しなど一時要因に影響されやすく、構造的体力(Net Burn)とは乖離することがあります。両者の乖離が大きい場合は必ず触れ、Net Burn ペースが経営判断のアンカーである旨を添えてください。'
  : primaryMode === 'worstCase'
    ? 'Gross Burn は売上ゼロを仮定した最悪ケースです。実際は売上で一部相殺されるため、Net Burn と Actual Burn のレンジを併記して現実的な見立ても示してください。'
    : 'Net Burn は経常損失から非資金費用を差し引いた構造的損失です。Actual Burn が一見楽観的に見える場合は、AR 回収や前受金など一時要因の影響を必ず指摘し、経営判断では Net Burn を主指標にする旨を明示してください。'}
中小企業 CFO 目線で、資金繰りの余裕度合い、黒字化の必要性、追加資金確保の検討要否を述べてください。

3. 経営上の良い兆し
売上の伸びや赤字縮小など、当月から読み取れる前向きな変化を評価してください。
ただし、再現性のある売上かどうかを確認すべきと添え、楽観しすぎないでください。

4. 注意点と次に見るべき論点
当月売上が一時的な大型案件か継続売上かの確認、販管費の内訳分解（人件費・外注費・広告費・システム費・その他固定費）、黒字化までに必要な売上上乗せ額やコスト削減幅などを、確認事項として整理してください。

5. 提案の粒度
提案は大げさな経営改革ではなく、翌月から実行できる現実的なものにしてください。
販管費の内訳確認、継続売上の確認、入金予定表の更新、固定費の見直し、3ヶ月資金繰り表の作成、黒字化ラインの確認などを優先してください。

## 表現ルール

- 経営者向けに、わかりやすく端的に書いてください。
- 専門用語を使う場合は、自然な文章の中で意味が伝わるようにしてください。
- 危機感は出すが、不安を煽りすぎないでください。
- 「改善しているが、まだ安心できない」というバランスで書いてください。
- 断定しすぎず、確認すべき点は確認事項として扱ってください。
- 銀行提出資料のような硬すぎる文体ではなく、CFO が社長に月次報告するような実務的な文体にしてください。

## 出力ルール（厳守）

- 各 content は必ず 2〜3 文の平文のみ
- 箇条書き、番号リスト、マークダウン記法、太字は禁止
- summary は 3〜5 文の平文。${targetMonthData.month}単月の具体的な数字を含めること
- 「${targetMonthData.month}の…」のように主語を単月に置くこと
- 推移は「直近数ヶ月のトレンド」として言及するが、主役は常に当月にすること
- highlights の text は 15 文字以内の短いフレーズにすること
- 数字は円・万円・ヶ月を使い、経営者が直感的に読める表現にすること
- highlights の type は positive / negative / warning / neutral のいずれかにすること
- JSON として正しくパースできる形式で出力すること
- JSON 外の説明文は出力しないこと

## 出力形式

以下のJSON形式で回答してください。sections の title は必ず指定の見出しを使うこと。
{"summary":"${targetMonthData.month}単月のエグゼクティブサマリー(3〜5文、具体的な数字を含める)","sections":[${sectionsJsonTemplate}],"highlights":[{"text":"15字以内","type":"positive"},{"text":"15字以内","type":"warning"}]}`;

      const res = await llm.generate(prompt, { maxTokens: 4096, json: true });
      let parsed = extractJson<{ summary: string; sections?: AiSectionItem[]; highlights: AiHighlight[] }>(res.text);

      // Geminiが二重JSON（summaryの値がさらにJSON）を返す場合の対策
      if (parsed?.summary && parsed.summary.trim().startsWith('{')) {
        const inner = extractJson<{ summary: string; sections?: AiSectionItem[]; highlights: AiHighlight[] }>(parsed.summary);
        if (inner) parsed = { ...parsed, ...inner };
      }

      // summaryにJSONキー名が混入している場合の除去（"summary: ..."→"..."）
      let summary = parsed?.summary || '';
      if (!summary || summary.includes('summary:')) {
        // extractJsonが失敗した場合: テキストからsummary部分を抽出
        const summaryMatch = res.text.match(/summary["\s:]+([^"}{]+)/);
        summary = summaryMatch ? summaryMatch[1].trim() : res.text.replace(/[{}"\\n]/g, ' ').replace(/\s+/g, ' ').replace(/^\s*summary\s*:\s*/i, '').substring(0, 500);
      }

      // sectionsをテキストから抽出（parsedで取れなかった場合）
      let sections = parsed?.sections || [];
      if (sections.length === 0) {
        const sectionMatches = [...res.text.matchAll(/"title"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([^"]+)"/g)];
        sections = sectionMatches.map((m) => ({ title: m[1], content: m[2] }));
      }

      // highlightsをテキストから抽出
      let highlights = parsed?.highlights || [];
      if (highlights.length === 0) {
        const hlMatches = [...res.text.matchAll(/"type"\s*:\s*"(positive|negative|warning|neutral)"\s*,\s*"text"\s*:\s*"([^"]+)"/g)];
        highlights = hlMatches.map((m) => ({ type: m[1] as AiHighlight['type'], text: m[2] }));
      }

      return {
        summary,
        sections,
        highlights,
        targetMonth: targetMonthData.month,
        targetMonthData,
        monthlyTrend: trend,
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error('AI summary generation failed', err?.message);
      return {
        summary: `AIサマリー生成エラー: ${err?.message || '不明'}`,
        highlights: [],
        targetMonth: targetMonthData.month,
        targetMonthData,
        monthlyTrend: trend,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // =========================================
  // 通期(全期間)AIサマリー — endMonth 未指定時に呼ばれる
  // =========================================
  private async generateCumulativeSummary(
    orgId: string,
    fiscalYear?: number,
    runwayMode?: 'worstCase' | 'netBurn' | 'actual',
    focus: AiFocus = 'all',
  ): Promise<AiSummaryResponse> {
    const [finCtx, transitionPl] = await Promise.all([
      this.getFinancialContext(orgId, fiscalYear).catch(() => null),
      this.mfApi.getTransitionPL(orgId, fiscalYear).catch(() => null),
    ]);

    // MF trial balance が落ちると plRows が空になり、累計値が全部0で
    // 「通期分析」と称した0円レポートが返る危険がある。fail-fast でエラーレポートを返す。
    if (!finCtx?.plRows || finCtx.plRows.length === 0) {
      this.logger.warn(
        `Cumulative AI summary aborted: MF financial context unavailable (orgId=${orgId}, fy=${fiscalYear ?? 'none'})`,
      );
      return {
        summary:
          'AIサマリー生成不可: MF会計の累計データが取得できませんでした。MF連携状況をご確認のうえ、再生成してください（推移表ではなく試算表PLのフェッチが失敗しています）。',
        highlights: [],
        targetMonth: fiscalYear ? `${fiscalYear}年度通期` : '当期通期',
        monthlyTrend: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const burnContext = finCtx.cashflowDerived
      ? this.mfTransform.formatBurnContextForPrompt(finCtx.cashflowDerived, runwayMode)
      : '';
    const primaryMode: 'worstCase' | 'netBurn' | 'actual' = runwayMode ?? 'netBurn';
    const primaryLabel: Record<typeof primaryMode, string> = {
      worstCase: 'Gross Burn(売上ゼロ最悪)',
      netBurn: 'Net Burn(構造的損失)',
      actual: 'Actual Burn(BS純減ベース)',
    };

    // 通期累計データ（trial balance PL から）
    const plRows = finCtx.plRows;
    const find = (key: string, exclude?: string[]): number => {
      const row = plRows.find(
        (r) =>
          r.category.includes(key) &&
          (!exclude || !exclude.some((e) => r.category.includes(e))),
      );
      return row?.current ?? 0;
    };
    const cumRevenue = find('売上高', ['原価', '総利益']);
    const cumCogs = find('売上原価');
    const cumSga = find('販売費及び一般管理費');
    const cumOp = find('営業利益');
    const cumOrd = find('経常利益');
    const cumGrossProfit = cumRevenue - cumCogs;

    // 売上が0の場合も同様にレポート意味なし → fail-fast
    if (cumRevenue === 0 && cumSga === 0 && cumOp === 0) {
      this.logger.warn(
        `Cumulative AI summary aborted: PL all zero (orgId=${orgId}, fy=${fiscalYear ?? 'none'})`,
      );
      return {
        summary:
          'AIサマリー生成不可: MF会計から取得した累計値が全て0でした。会計年度や顧問先設定をご確認ください。',
        highlights: [],
        targetMonth: fiscalYear ? `${fiscalYear}年度通期` : '当期通期',
        monthlyTrend: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // 月次推移（実績月のみ）
    const trend: AiMonthlyTrendPoint[] = transitionPl
      ? this.mfTransform.transformTransitionPL(transitionPl).map((p, i, arr) => {
          const sgaTrend = transitionPl
            ? this.mfTransform.getAccountTransition(transitionPl, '販売費及び一般管理費合計')
            : [];
          const cogsTrend = transitionPl
            ? this.mfTransform.getAccountTransition(transitionPl, '売上原価')
            : [];
          const sga = sgaTrend[i]?.amount ?? 0;
          const cogs = cogsTrend[i]?.amount ?? 0;
          void arr;
          return {
            month: p.month,
            revenue: p.revenue,
            operatingProfit: p.operatingProfit,
            actual: sga > 100_000 || cogs > 0,
          };
        })
      : [];

    const periodLabel = fiscalYear ? `${fiscalYear}年度通期` : '当期通期';

    try {
      const llm = this.ensureLlm();
      const profileBlock = await this.getCustomerProfileBlock(orgId);
      const policyBlock = await this.getOrgPolicyBlock(orgId);
      const trendLines = trend
        .filter((p) => p.actual)
        .map(
          (p) =>
            `${p.month}: 売上 ${p.revenue.toLocaleString()}円 / 営業利益 ${p.operatingProfit.toLocaleString()}円`,
        )
        .join('\n');
      const focusInstruction = FOCUS_INSTRUCTION[focus];
      const sectionTitles = FOCUS_SECTIONS[focus];
      const sectionsJsonTemplate = sectionTitles
        .map((t) => `{"title":"${t}","content":"このセクションのテーマに関する分析を 2-3 文で"}`)
        .join(',');

      const prompt = `あなたは中小企業のCFO代行として、顧問先の財務を経営者向けにわかりやすく分析する会計事務所の経営コンサルタントです。

以下は「${periodLabel}」の累計財務データと、当期の月次推移です。

主題は「${periodLabel}の通期分析」です。
単月のブレに引きずられず、累計値で当期の収益構造・資金繰りを評価してください。
月次推移は当期の傾向(改善/悪化)を読むための補助情報として扱ってください。

【今回のフォーカス】
${focusInstruction}

分析の目的は、経営者が「当期累計の到達点」「資金繰り上の体力」「期末までに取るべき打ち手」を短時間で把握できるようにすることです。
大企業向けの高度な財務理論や過度な専門用語は避け、中小企業のCFOが社長に説明するような実務的なトーンにしてください。
${profileBlock ? '\n' + profileBlock + '\n※ 上記プロファイルを踏まえ、業種・規模を断定しすぎず、読み取れる範囲で中小企業・スタートアップ寄りの観点から分析してください。\n※ 不明な情報は推測しすぎず、「確認したい論点」として自然に触れてください。\n' : ''}
${policyBlock ? '\n' + policyBlock + '\n' : ''}
## ${periodLabel} 累計財務データ

- 売上高(累計): ${cumRevenue.toLocaleString()}円
- 売上総利益(累計): ${cumGrossProfit.toLocaleString()}円
- 販管費(累計): ${cumSga.toLocaleString()}円
- 営業利益(累計): ${cumOp.toLocaleString()}円
- 経常利益(累計): ${cumOrd.toLocaleString()}円

${burnContext}

## 月次推移（実績月のみ）

${trendLines || '（推移データなし）'}

## 分析方針

${periodLabel}の累計売上、累計販管費、累計営業利益・経常利益、当期のランウェイを中心に分析してください。
月次推移は「当期の傾向(改善 or 悪化)」を確認する補助として使ってください。
当期累計が黒字か赤字か、改善トレンドか悪化トレンドかをはっきり評価してください。

特に以下の観点を含めてください。

1. ${periodLabel}累計の損益状況
売上高に対する販管費比率、粗利率、営業利益率を踏まえて、固定費を売上で吸収できているかを評価してください。

2. 資金繰りとランウェイ
主指標は **${primaryLabel[primaryMode]}** ベースのランウェイです（資金繰りページでユーザーが選択中のモードに合わせています）。現預金水準と比較してください。
${
  primaryMode === 'actual'
    ? 'Actual Burn は AR 回収や前受金取崩しなど一時要因に影響されやすく、構造的体力(Net Burn)とは乖離することがあります。両者の乖離が大きい場合は必ず触れ、Net Burn ペースが経営判断のアンカーである旨を添えてください。'
    : primaryMode === 'worstCase'
      ? 'Gross Burn は売上ゼロを仮定した最悪ケースです。実際は売上で一部相殺されるため、Net Burn と Actual Burn のレンジを併記して現実的な見立ても示してください。'
      : 'Net Burn は経常損失から非資金費用を差し引いた構造的損失です。Actual Burn が一見楽観的に見える場合は、AR 回収や前受金など一時要因の影響を必ず指摘し、経営判断では Net Burn を主指標にする旨を明示してください。'
}
中小企業 CFO 目線で、資金繰りの余裕度合い、黒字化の必要性、追加資金確保の検討要否を述べてください。

3. 当期の良い兆し
売上の成長、収益構造の改善など、月次推移から読み取れる前向きな変化を評価してください。
ただし、再現性のある成長かどうかを確認すべきと添え、楽観しすぎないでください。

4. 注意点と次に見るべき論点
販管費の内訳分解（人件費・外注費・広告費・システム費・その他固定費）、月次のばらつき、季節性などを確認事項として整理してください。
通期着地予測との乖離(残月でリカバリ可能か)も触れてください。

5. 提案の粒度
提案は大げさな経営改革ではなく、期末までに実行できる現実的なものにしてください。
販管費の内訳確認、継続売上の確保、入金予定表の更新、固定費の見直し、3ヶ月資金繰り表の作成などを優先してください。

## 表現ルール

- 経営者向けに、わかりやすく端的に書いてください。
- 専門用語を使う場合は、自然な文章の中で意味が伝わるようにしてください。
- 危機感は出すが、不安を煽りすぎないでください。
- 「改善しているが、まだ安心できない」というバランスで書いてください。
- 断定しすぎず、確認すべき点は確認事項として扱ってください。
- 銀行提出資料のような硬すぎる文体ではなく、CFO が社長に月次報告するような実務的な文体にしてください。

## 出力ルール（厳守）

- 各 content は必ず 2〜3 文の平文のみ
- 箇条書き、番号リスト、マークダウン記法、太字は禁止
- summary は 3〜5 文の平文。${periodLabel}累計の具体的な数字を含めること
- 「${periodLabel}は…」のように主語を通期に置くこと
- 単月のブレに引きずられず、累計の収益構造で語ること
- highlights の text は 15 文字以内の短いフレーズにすること
- 数字は円・万円・ヶ月を使い、経営者が直感的に読める表現にすること
- highlights の type は positive / negative / warning / neutral のいずれかにすること
- JSON として正しくパースできる形式で出力すること
- JSON 外の説明文は出力しないこと

## 出力形式

以下のJSON形式で回答してください。sections の title は必ず指定の見出しを使うこと。
{"summary":"${periodLabel}累計のエグゼクティブサマリー(3〜5文、具体的な数字を含める)","sections":[${sectionsJsonTemplate}],"highlights":[{"text":"15字以内","type":"positive"},{"text":"15字以内","type":"warning"}]}`;

      const res = await llm.generate(prompt, { maxTokens: 4096, json: true });
      let parsed = extractJson<{
        summary: string;
        sections?: AiSectionItem[];
        highlights: AiHighlight[];
      }>(res.text);

      if (parsed?.summary && parsed.summary.trim().startsWith('{')) {
        const inner = extractJson<{
          summary: string;
          sections?: AiSectionItem[];
          highlights: AiHighlight[];
        }>(parsed.summary);
        if (inner) parsed = { ...parsed, ...inner };
      }

      let summary = parsed?.summary || '';
      if (!summary || summary.includes('summary:')) {
        const summaryMatch = res.text.match(/summary["\s:]+([^"}{]+)/);
        summary = summaryMatch
          ? summaryMatch[1].trim()
          : res.text
              .replace(/[{}"\\n]/g, ' ')
              .replace(/\s+/g, ' ')
              .replace(/^\s*summary\s*:\s*/i, '')
              .substring(0, 500);
      }

      let sections = parsed?.sections || [];
      if (sections.length === 0) {
        const sectionMatches = [
          ...res.text.matchAll(/"title"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([^"]+)"/g),
        ];
        sections = sectionMatches.map((m) => ({ title: m[1], content: m[2] }));
      }

      let highlights = parsed?.highlights || [];
      if (highlights.length === 0) {
        const hlMatches = [
          ...res.text.matchAll(
            /"type"\s*:\s*"(positive|negative|warning|neutral)"\s*,\s*"text"\s*:\s*"([^"]+)"/g,
          ),
        ];
        highlights = hlMatches.map((m) => ({
          type: m[1] as AiHighlight['type'],
          text: m[2],
        }));
      }

      return {
        summary,
        sections,
        highlights,
        targetMonth: periodLabel,
        targetMonthData: {
          month: periodLabel,
          revenue: cumRevenue,
          grossProfit: cumGrossProfit,
          sga: cumSga,
          operatingProfit: cumOp,
          ordinaryProfit: cumOrd,
        },
        monthlyTrend: trend,
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error('AI cumulative summary generation failed', err?.message);
      return {
        summary: `AIサマリー生成エラー: ${err?.message || '不明'}`,
        highlights: [],
        targetMonth: periodLabel,
        monthlyTrend: trend,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // =========================================
  // #10: AIトークスクリプト
  // =========================================
  async generateTalkScript(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
    runwayMode?: 'worstCase' | 'netBurn' | 'actual',
  ): Promise<TalkScript> {
    try {
      const { dashboard, plRows, cashflowDerived } = await this.getFinancialContext(
        orgId,
        fiscalYear,
        endMonth,
      );
      const burnContext = cashflowDerived
        ? this.mfTransform.formatBurnContextForPrompt(cashflowDerived, runwayMode)
        : '';
      const llm = this.ensureLlm();
      const profileBlock = await this.getCustomerProfileBlock(orgId);
      const policyBlock = await this.getOrgPolicyBlock(orgId);

      // 月次推移（単月実績）を付けて「前月比」「累計ビハインド」等が語れるようにする
      // 翌月以降のスケジュール売上は除外し、対象月までの「営業活動が動いた月」のみ
      const transitionPl = await this.mfApi
        .getTransitionPL(orgId, fiscalYear, endMonth)
        .catch(() => null);
      const trendPoints = (() => {
        if (!transitionPl) return [] as { month: string; revenue: number; operatingProfit: number }[];
        const pts = this.mfTransform.transformTransitionPL(transitionPl);
        const sgaSeries = this.mfTransform.getAccountTransition(transitionPl, '販売費及び一般管理費合計');
        const cogsSeries = this.mfTransform.getAccountTransition(transitionPl, '売上原価');
        const isOpActual = (i: number) => (sgaSeries[i]?.amount ?? 0) > 100_000 || (cogsSeries[i]?.amount ?? 0) > 0;
        const targetMonthLabel = endMonth ? `${endMonth}月` : null;
        const cutoffIdx = targetMonthLabel
          ? pts.findIndex((p) => p.month === targetMonthLabel)
          : (() => {
              for (let i = pts.length - 1; i >= 0; i--) if (isOpActual(i)) return i;
              return -1;
            })();
        return pts
          .slice(0, cutoffIdx >= 0 ? cutoffIdx + 1 : pts.length)
          .filter((_, i) => isOpActual(i));
      })();
      const trendBlock = trendPoints.length
        ? `## 月次推移（単月実績、過去〜直近）\n${trendPoints
            .map(
              (p) =>
                `- ${p.month}: 売上 ${p.revenue.toLocaleString()}円 / 営業利益 ${p.operatingProfit.toLocaleString()}円`,
            )
            .join('\n')}`
        : '';

      const targetLabel = endMonth ? `${endMonth}月` : '直近月';
      const periodNote = endMonth
        ? `対象月: ${targetLabel}（会計期間${fiscalYear ?? '最新年度'}の期首〜${targetLabel}までの累計+推移）`
        : `対象期間: 当期通期累計+月次推移`;

      const prompt = `あなたは会計事務所の顧問担当者です。巡回監査・月次報告の場で、関与先企業の社長に直接話す「トークスクリプト」を日本語で作成してください。
以下の「理想構成」を完全に踏襲し、数字は必ず具体的に引用し、会話調で話しやすい文章にしてください。
業種・規模に応じた自然な話題選びも心がけてください。

# 対象
${periodNote}

# データ捏造の厳禁
- 与えられた財務データに無い金額を絶対に作り出さない。与えられた数字だけを引用する。
- 「売上高3期比較表」や「製造原価の推移表」等の資料名を参照しても、値は与えられた数字以外を決して書かない。
- 予算・目標が与えられていない場合、「目標達成」や「ビハインド」の断定を書かない。代わりに「今月の売上は〜円でした。目標との比較は別途ご確認ください」のようにデータ未提供を素直に認める表現にする。
- 売掛金・買掛金・借入金の固有名（○○社など）は、データに明記されていなければ書かない。代わりに「売掛金の内訳のうち回収が遅れている先がないかご確認させてください」のような形にする。
- 助成金・社労士紹介などの事務所側提案は、与えられた業種・規模データから妥当な範囲に留める。

# 理想構成（必ずこの順序でsections 5件を作ること）
- **導入（opening）**: 本日の目的共有。「〇〇月の試算表とレビューが完了」「財政状態と経営成績の報告」「期末に向けた見通しのすり合わせ」を含む。
- **ステップ1: 前月業績報告（売上ハイライト）** — 資料:「売上高3期比較表」
  - 前月の売上高と目標達成状況（達成していれば祝意、未達ならその度合い）
  - 累計ビハインド / 先行幅、残月あたり必要上乗せ
  - 【ヒアリング】好調/不調要因の分析、現場の進捗
- **ステップ2: 前月損益報告（P/L深掘り）** — 資料:「損益計算書 (P/L)」「製造原価の推移表」
  - 営業利益、経常利益の着地
  - 前月比で目立った費用科目（販管費の異常値等）
  - 【ヒアリング】費用増減の特別要因・組織体制の変動
- **ステップ3: 前月貸借対照表報告（B/S・資金状況）** — 資料:「貸借対照表」
  - 現預金残高、売掛金/買掛金/借入金
  - 利益とキャッシュのズレの原因（回収タイミング、設備投資等）
  - 【ヒアリング】売掛金の遅延、不良債権、未回収の状況
- **ステップ4: 期末までの損益予測と資金繰り** — 資料:「損益予測資料」「簡易CF予測」
  - 期末着地見込み、法人税・消費税の納税予測
  - 向こう数ヶ月の資金繰りシミュレーション（借入返済・納税反映済み）
- **ステップ5: 課題のヒアリングとネクストアクション設定**
  - 【ヒアリング】経営者のリアルな「壁」を引き出す質問（採用、新規開拓、業務効率化など）
  - 【提案】事務所側から具体アクション（助成金診断、社労士紹介、給与規定レビュー等）
- **結び（closing）**: 本日の報告事項再確認、次回までの宿題の明示

# 各セクションの必須フィールド
- title: 例「ステップ1: 前月業績報告（売上ハイライト）」
- material: 使用する資料名（なければ省略）
- content: 担当者の発言。2-4文、具体的な数字を引用、会話調（「社長、〜」で始めても良い）
- hearings: 3件前後のヒアリング質問を配列で（「〜はいかがでしょうか？」調）
- anticipatedResponses: 社長の想定回答を1-2件（省略可）
- proposals: 【提案・アクション】が該当するセクションでは配列で（主にステップ5）
- qa: 想定Q&A 1件（省略可）

# 厳守ルール
- 数字は与えられたデータから直接引用する。推測で捏造しない。データがない項目は「〜についても確認したい」と濁す。
- 業種・規模プロファイルに合わせた粒度で話す（小規模零細に「部門別予算」と言わない等）。
- 箇条書き・マークダウン・見出し記号（#、*）はcontent中に含めない。会話原稿なので全て平文。
- 出力は下記JSONのみ。他の装飾・説明は不要。

# 出力形式（JSON）
{
  "opening": "導入の原稿(2-4文の平文)",
  "sections": [
    {"title":"...","material":"...","content":"...","hearings":["...","..."],"anticipatedResponses":["..."],"proposals":["..."],"qa":[{"q":"...","a":"..."}]}
    (5件)
  ],
  "closing": "結びの原稿(2-4文の平文)",
  "nextActionsForAdvisor": ["担当者側の次回までの宿題","..."],
  "nextActionsForExecutive": ["経営者側の次回までの宿題","..."]
}
${profileBlock ? '\n' + profileBlock + '\n' : ''}
${policyBlock ? '\n' + policyBlock + '\n' : ''}
${this.financialDataBlock(dashboard, plRows, burnContext)}
${trendBlock ? '\n' + trendBlock + '\n' : ''}`;

      const res = await llm.generate(prompt, { maxTokens: 6144, json: true });
      const parsed = extractJson<Omit<TalkScript, 'generatedAt'>>(res.text);

      if (!parsed || !parsed.opening) {
        // 応答が壊れた場合のみ、長さとparse失敗を残す(中身は出さない)
        this.logger.warn(
          `TalkScript LLM parse failed (len=${res.text.length})`,
        );
      }

      return {
        opening: parsed?.opening || '',
        sections: parsed?.sections || [],
        closing: parsed?.closing || '',
        nextActionsForAdvisor: parsed?.nextActionsForAdvisor || [],
        nextActionsForExecutive: parsed?.nextActionsForExecutive || [],
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error('Talk script generation failed', err?.message);
      return {
        opening: `生成エラー: ${err?.message}`,
        sections: [],
        closing: '',
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // =========================================
  // #11: 予算策定ヘルパー（3シナリオ）
  // =========================================
  async generateBudgetScenarios(
    orgId: string,
    fiscalYear?: number,
    params?: {
      baseGrowthRate?: number;    // Base成長率(%)
      upsideGrowthRate?: number;  // Upside成長率(%)
      downsideGrowthRate?: number; // Downside成長率(%)
      newHires?: number;          // 採用予定人数
      costReductionRate?: number; // コスト削減率(%)
      notes?: string;             // 追加コンテキスト
    },
    runwayMode?: 'worstCase' | 'netBurn' | 'actual',
  ): Promise<BudgetScenario[]> {
    try {
      const { dashboard, plRows, cashflowDerived } = await this.getFinancialContext(orgId, fiscalYear);
      const burnContext = cashflowDerived
        ? this.mfTransform.formatBurnContextForPrompt(cashflowDerived, runwayMode)
        : '';

      const paramBlock = params
      ? `\n## ユーザー指定パラメータ（これを前提条件として必ず反映すること）
${params.baseGrowthRate !== undefined ? `- Base売上成長率: ${params.baseGrowthRate}%\n` : ''}${params.upsideGrowthRate !== undefined ? `- Upside売上成長率: ${params.upsideGrowthRate}%\n` : ''}${params.downsideGrowthRate !== undefined ? `- Downside売上成長率: ${params.downsideGrowthRate}%\n` : ''}${params.newHires !== undefined ? `- 採用予定人数: ${params.newHires}名\n` : ''}${params.costReductionRate !== undefined ? `- コスト削減率: ${params.costReductionRate}%\n` : ''}${params.notes ? `- 補足: ${params.notes}\n` : ''}`
      : '';

      const llm = this.ensureLlm();
      const profileBlock = await this.getCustomerProfileBlock(orgId);
      const policyBlock = await this.getOrgPolicyBlock(orgId);
      const prompt = `あなたは会計事務所の経営コンサルタントです。以下の今期実績データに基づき、来期の予算を3つのシナリオで提案してください。
ユーザー指定パラメータがある場合は、それを前提条件として必ず反映してください。パラメータが指定されていない項目は、業種・規模などのプロファイルと実績データから合理的に推定してください。
${profileBlock ? '\n' + profileBlock + '\n' : ''}
${policyBlock ? '\n' + policyBlock + '\n' : ''}
${this.financialDataBlock(dashboard, plRows, burnContext)}
${paramBlock}
## 出力形式（JSON配列）
[{"name":"Base","description":"基本シナリオの説明","revenue":来期売上予測（円）,"operatingProfit":来期営業利益予測（円）,"assumptions":["前提条件1","前提条件2","前提条件3"]},{"name":"Upside","description":"...","revenue":...,"operatingProfit":...,"assumptions":[...]},{"name":"Downside","description":"...","revenue":...,"operatingProfit":...,"assumptions":[...]}]`;

      const res = await llm.generate(prompt, { maxTokens: 2048, json: true });
      const match = res.text.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return [];
    } catch (err: any) {
      this.logger.error('Budget scenario generation failed', err?.message);
      return [];
    }
  }

  // =========================================
  // #12: 資金調達レポート
  // =========================================
  async generateFundingReport(
    orgId: string,
    fiscalYear?: number,
    scenarios?: Array<{
      name: string;
      principal: number;
      monthlyPayment: number;
      totalInterest: number;
      termMonths: number;
      interestRate: number;
    }>,
    endMonth?: number,
    runwayMode?: 'worstCase' | 'netBurn' | 'actual',
  ): Promise<FundingReport> {
    try {
      const { dashboard, plRows, cashflowDerived } = await this.getFinancialContext(orgId, fiscalYear, endMonth);
      const burnContext = cashflowDerived
        ? this.mfTransform.formatBurnContextForPrompt(cashflowDerived, runwayMode)
        : '';
      const llm = this.ensureLlm();
      const profileBlock = await this.getCustomerProfileBlock(orgId);
      const policyBlock = await this.getOrgPolicyBlock(orgId);
      const periodNote = endMonth
        ? `（集計期間: 期首〜${endMonth}月の累計）`
        : '（集計期間: 通期累計）';

      const scenarioBlock = scenarios && scenarios.length > 0
        ? `\n## 顧問が検討中の借入シナリオ（融資シミュレーションの結果）\n${scenarios
            .map(
              (s) =>
                `- ${s.name}: 元金 ${s.principal.toLocaleString()}円、年率 ${s.interestRate}%、期間 ${s.termMonths}ヶ月、月額返済 ${s.monthlyPayment.toLocaleString()}円、総利息 ${s.totalInterest.toLocaleString()}円`,
            )
            .join('\n')}\n`
        : '';

      const prompt = `あなたは投資家・金融機関向けの資金調達レポートを作成する専門家です。以下の財務データと顧問先プロファイルに基づき、業種・規模に応じた資金調達用のレポートを作成してください。
財務データは${periodNote}のスナップショットです。レポート中でこの期間を明示してください。
${profileBlock ? '\n' + profileBlock + '\n' : ''}
${policyBlock ? '\n' + policyBlock + '\n' : ''}
${this.financialDataBlock(dashboard, plRows, burnContext)}
${scenarioBlock}
## 資金調達オプションの提案ルール
- 1〜3件の具体的な調達オプションを suggestedOptions に出すこと。
- 各オプションには type(種別)、amount(円)、rationale(根拠)を含める。
- 借入系オプションの場合は suggestedRate(年率%)、suggestedMonths(返済月数)、repaymentType("EQUAL_INSTALLMENT"|"EQUAL_PRINCIPAL"|"BULLET")を必ず付ける。
- 顧問が検討中のシナリオが与えられている場合は、それを踏まえて現実的な代替案 or 追加提案を出す。

## 重要：提案してはいけない制度（受付終了済み）
以下の制度は 2024 年 3 月末で受付終了しているため、絶対に提案に含めないこと:
- 新型コロナウイルス感染症特別貸付 (日本政策金融公庫)
- 新型コロナ対策資本性劣後ローン / 新型コロナ対策資本性ローン
- セーフティネット保証 4号 / 5号 (コロナ枠)
- 民間金融機関の実質無利子・無担保融資（ゼロゼロ融資）

代わりに 2026 年 4 月時点で利用可能な制度を提案すること:
- 日本政策金融公庫の通常メニュー（普通貸付 / 経営改善貸付 / 新事業育成資金 / 企業活力強化資金 等）
- 商工中金の通常融資 / 危機対応業務（事業性評価融資 等）
- 信用保証協会付き融資（マル経資金 / セーフティネット保証 1〜3号 / 経営力強化保証 等）
- 民間銀行のプロパー融資 / コミットメントライン
- ベンチャーデットや成長段階に応じた資本性劣後ローン (公庫の通常メニュー枠内)
- エクイティ調達（VC / 第三者割当増資）

## 出力形式（JSON）
{"executiveSummary":"事業概要と資金ニーズ（3-5文）","financialHighlights":["財務ハイライト1","ハイライト2","ハイライト3"],"strengthsRisks":{"strengths":["強み1","強み2"],"risks":["リスク1","リスク2"]},"projections":"今後の見通し（3-5文）","suggestedOptions":[{"type":"銀行借入(運転資金)","amount":30000000,"rationale":"...","suggestedRate":2.5,"suggestedMonths":60,"repaymentType":"EQUAL_INSTALLMENT"}]}`;

      const res = await llm.generate(prompt, { maxTokens: 2500, json: true });
      const parsed = extractJson<Omit<FundingReport, 'generatedAt'>>(res.text);

      if (!parsed || !parsed.executiveSummary) {
        this.logger.warn(
          `Funding report LLM parse failed (len=${res.text.length})`,
        );
      }

      return {
        executiveSummary: parsed?.executiveSummary || '',
        financialHighlights: parsed?.financialHighlights || [],
        strengthsRisks: parsed?.strengthsRisks || { strengths: [], risks: [] },
        projections: parsed?.projections || '',
        suggestedOptions: parsed?.suggestedOptions || [],
        echoedScenarios: scenarios,
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error('Funding report generation failed', err?.message);
      return {
        executiveSummary: `生成エラー: ${err?.message}`,
        financialHighlights: [],
        strengthsRisks: { strengths: [], risks: [] },
        projections: '',
        suggestedOptions: [],
        echoedScenarios: scenarios,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // =========================================
  // #13: 財務指標 AI CFO 解説
  // =========================================
  /**
   * 財務指標を読み取り、CFO 目線で安全性 / 収益性 / 効率性カテゴリ別に解説する。
   * 各カテゴリで「現状の summary」と「打ち手 advice」を返す。
   *
   * 数値が 0 や歪なケース（債務超過 = 負の純資産）でも壊れず、
   * 「データが足りないため判断保留」など節度ある回答に倒す。
   */
  async generateIndicatorsCommentary(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ): Promise<IndicatorsCommentaryResponse> {
    const now = new Date().toISOString();
    let pl: import('../mf/types/mf-api.types').MfTrialBalance | null = null;
    let bs: import('../mf/types/mf-api.types').MfTrialBalance | null = null;
    try {
      pl = await this.mfApi.getTrialBalancePL(orgId, fiscalYear, endMonth);
      bs = await this.mfApi.getTrialBalanceBS(orgId, fiscalYear, endMonth);
    } catch (err) {
      this.logger.warn(
        `Indicators commentary: MF fetch failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    const fallbackInputs = {
      currentRatio: 0,
      equityRatio: 0,
      debtEquityRatio: 0,
      grossProfitMargin: 0,
      operatingProfitMargin: 0,
      roe: 0,
      roa: 0,
      totalAssetTurnover: 0,
      receivablesTurnover: 0,
    };

    if (!pl || !bs) {
      return {
        categories: this.fallbackCategories(),
        overallSummary:
          'MF会計が未連携、または試算表データを取得できませんでした。連携後に再生成してください。',
        inputs: fallbackInputs,
        generatedAt: now,
        fallbackReason: 'MF データ未取得',
      };
    }

    const indicators = this.mfTransform.calculateFinancialIndicators(pl, bs);

    const provider = createLlmProvider(this.httpService);
    if (!provider) {
      return {
        categories: this.fallbackCategories(),
        overallSummary:
          'AI プロバイダー未設定のため、自動解説は表示できません。指標値そのものを参照してください。',
        inputs: indicators,
        generatedAt: now,
        fallbackReason: 'LLM 未設定',
      };
    }

    try {
      const profileBlock = await this.getCustomerProfileBlock(orgId);
      const policyBlock = await this.getOrgPolicyBlock(orgId);
      const usesCostAccounting = await this.getUsesCostAccounting(orgId);
      const periodNote = endMonth
        ? `集計期間: 期首〜${endMonth}月の累計`
        : '集計期間: 通期累計';
      // 原価計算未運用なら売上総利益率はプロンプトから除外して LLM が触らないようにする
      const profitabilityBlock = usesCostAccounting
        ? `- 収益性
  - 売上総利益率: ${indicators.grossProfitMargin.toFixed(1)}%
  - 営業利益率: ${indicators.operatingProfitMargin.toFixed(1)}%
  - ROE: ${indicators.roe.toFixed(1)}%
  - ROA: ${indicators.roa.toFixed(1)}%`
        : `- 収益性（※ 原価計算未運用のため売上総利益率は除外。営業利益基準で評価）
  - 営業利益率: ${indicators.operatingProfitMargin.toFixed(1)}%
  - ROE: ${indicators.roe.toFixed(1)}%
  - ROA: ${indicators.roa.toFixed(1)}%`;
      const prompt = `あなたは中小企業のCFO代行として、顧問先の財務指標を経営者向けに解説する会計事務所のコンサルタントです。
${profileBlock ? '\n' + profileBlock + '\n' : ''}
${policyBlock ? '\n' + policyBlock + '\n' : ''}
${periodNote}

## 財務指標（試算表ベース）
- 安全性
  - 流動比率: ${indicators.currentRatio.toFixed(1)}%（流動資産/流動負債）
  - 自己資本比率: ${indicators.equityRatio.toFixed(1)}%（純資産/総資産）
  - 負債比率: ${indicators.debtEquityRatio.toFixed(1)}%（負債/純資産。負値=債務超過）
${profitabilityBlock}
- 効率性
  - 総資産回転率: ${indicators.totalAssetTurnover.toFixed(2)}回
  - 売上債権回転率: ${indicators.receivablesTurnover.toFixed(2)}回

## 出力ルール（厳守）
- 各カテゴリ（安全性 / 収益性 / 効率性）について以下を返す
  - level: 'good' | 'caution' | 'warning' のいずれか
    - good: 中小企業の標準的な目安をクリア
    - caution: 一部数値が標準を割り込んでいて経過観察必要
    - warning: 早期の打ち手が必要
  - summary: 2-3 文の平文。具体的な数値を引用。経営者目線で読みやすく
  - advice: 1-2 文の打ち手。すぐ実行できる現実的な提案にする（"資金調達の検討" "回収サイトの再交渉" 等）
- overallSummary: 3 カテゴリ横断の総評を 2-3 文。社長に最初に伝える要点
- 不明・データ不足の項目は断定せず「数値が小さいため判断保留」のように節度を持って書く
- 専門用語は最小限。CFO が社長に説明するトーン
- マークダウン記法・箇条書き・番号リストは禁止（content は平文のみ）
- JSON として正しくパースできる形式で出力。JSON 外の説明文は出力しない

## 出力形式
{"categories":[{"name":"安全性","level":"good","summary":"...","advice":"..."},{"name":"収益性","level":"caution","summary":"...","advice":"..."},{"name":"効率性","level":"good","summary":"...","advice":"..."}],"overallSummary":"..."}`;

      const res = await provider.generate(prompt, { maxTokens: 1600, json: true });
      const parsed = extractJson<{
        categories?: Array<{
          name?: string;
          level?: string;
          summary?: string;
          advice?: string;
        }>;
        overallSummary?: string;
      }>(res.text);

      const categories = this.normalizeCommentaryCategories(parsed?.categories);
      const overallSummary =
        parsed?.overallSummary && parsed.overallSummary.trim().length > 0
          ? parsed.overallSummary.trim()
          : '財務指標から致命的なリスクは検出されていません。継続的にモニタリングしてください。';

      return {
        categories,
        overallSummary,
        inputs: indicators,
        generatedAt: now,
      };
    } catch (err) {
      this.logger.warn(
        `Indicators commentary LLM failed: ${err instanceof Error ? err.message : err}`,
      );
      return {
        categories: this.fallbackCategories(),
        overallSummary:
          'AI 解説の生成に失敗しました。指標値そのものを参照してください。',
        inputs: indicators,
        generatedAt: now,
        fallbackReason: 'LLM 生成エラー',
      };
    }
  }

  /** LLM 未設定 / エラー時のテンプレ。3 カテゴリすべて caution + 中立コピー */
  private fallbackCategories(): IndicatorsCommentaryCategory[] {
    return (['安全性', '収益性', '効率性'] as const).map((name) => ({
      name,
      level: 'caution' as const,
      summary: '自動解説は現在生成できません。指標カードの値とベンチマークを直接参照してください。',
      advice: 'AI 連携が復旧したらこのカードを再生成してください。',
    }));
  }

  /** LLM レスポンスを 3 カテゴリの配列に正規化（順序固定・型ガード） */
  private normalizeCommentaryCategories(
    raw: Array<{
      name?: string;
      level?: string;
      summary?: string;
      advice?: string;
    }> | undefined,
  ): IndicatorsCommentaryCategory[] {
    const order: IndicatorsCommentaryCategory['name'][] = [
      '安全性',
      '収益性',
      '効率性',
    ];
    return order.map((name) => {
      const found = raw?.find((c) => c?.name === name);
      const level: IndicatorsCommentaryCategory['level'] =
        found?.level === 'good' || found?.level === 'warning' || found?.level === 'caution'
          ? found.level
          : 'caution';
      return {
        name,
        level,
        summary:
          found?.summary && found.summary.trim().length > 0
            ? found.summary.trim()
            : '解説を取得できませんでした。',
        advice:
          found?.advice && found.advice.trim().length > 0
            ? found.advice.trim()
            : '指標カードの数値を直接ご確認ください。',
      };
    });
  }
}
