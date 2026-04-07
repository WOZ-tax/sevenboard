import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { DashboardSummary, FinancialStatementRow } from '../mf/types/mf-api.types';
import { createLlmProvider, extractJson, LlmProvider } from './llm-provider';

export interface AiHighlight {
  type: 'positive' | 'negative' | 'neutral';
  text: string;
}

export interface AiSectionItem {
  title: string;
  content: string;
}

export interface AiSummaryResponse {
  summary: string;
  sections?: AiSectionItem[];
  highlights: AiHighlight[];
  generatedAt: string;
}

export interface TalkScript {
  opening: string;
  sections: { title: string; content: string; qa?: { q: string; a: string }[] }[];
  closing: string;
  generatedAt: string;
}

export interface BudgetScenario {
  name: string; // "Base" | "Upside" | "Downside"
  description: string;
  revenue: number;
  operatingProfit: number;
  assumptions: string[];
}

export interface FundingReport {
  executiveSummary: string;
  financialHighlights: string[];
  strengthsRisks: { strengths: string[]; risks: string[] };
  projections: string;
  generatedAt: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private llm: LlmProvider | null;

  constructor(
    private httpService: HttpService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
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

  private async getFinancialContext(orgId: string, fiscalYear?: number) {
    const [pl, bs] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId, fiscalYear),
      this.mfApi.getTrialBalanceBS(orgId, fiscalYear),
    ]);
    const dashboard = this.mfTransform.buildDashboardSummary(pl, bs);
    const plRows = this.mfTransform.transformTrialBalancePL(pl);
    return { dashboard, plRows, pl, bs };
  }

  private financialDataBlock(dashboard: DashboardSummary, plRows: FinancialStatementRow[]): string {
    return `## 財務データ
- 売上高: ${dashboard.revenue}円
- 営業利益: ${dashboard.operatingProfit}円
- 経常利益: ${dashboard.ordinaryProfit}円
- 当期純利益: ${dashboard.netIncome}円
- 現預金残高: ${dashboard.cashBalance}円
- 総資産: ${dashboard.totalAssets}円
- ランウェイ: ${dashboard.runway}ヶ月
- 会計期間: ${dashboard.period.start} 〜 ${dashboard.period.end}

## PL明細
${plRows.map((r) => `${r.category}: ${r.current}円`).join('\n')}`;
  }

  // =========================================
  // #既存: 月次AIサマリー
  // =========================================
  async generateMonthlySummary(orgId: string, fiscalYear?: number): Promise<AiSummaryResponse> {
    const { dashboard, plRows } = await this.getFinancialContext(orgId, fiscalYear);

    try {
      const llm = this.ensureLlm();
      const prompt = `あなたは会計事務所の経営コンサルタントです。以下の財務データに基づき、月次経営サマリーを生成してください。

${this.financialDataBlock(dashboard, plRows)}

## 出力形式（JSON）
{
  "summary": "3〜5文のエグゼクティブサマリー。具体的な数字を含めること。",
  "sections": [
    {"title":"売上・利益分析","content":"2-3文で売上高・営業利益・経常利益の動向を分析"},
    {"title":"費用動向","content":"2-3文で主要費用項目の増減を分析"},
    {"title":"キャッシュフロー","content":"2-3文で現預金残高・ランウェイを分析"},
    {"title":"財務指標","content":"2-3文で総資産利益率や自己資本比率等を分析"},
    {"title":"リスク分析","content":"2-3文で財務上のリスク要因を指摘"},
    {"title":"アクション提案","content":"2-3文で具体的な改善アクションを提案"}
  ],
  "highlights": [{"type":"positive","text":"良い点"},{"type":"negative","text":"懸念点"},{"type":"neutral","text":"注意点"}]
}`;

      const res = await llm.generate(prompt, { maxTokens: 2048, json: true });
      const parsed = extractJson<{ summary: string; sections?: AiSectionItem[]; highlights: AiHighlight[] }>(res.text);

      return {
        summary: parsed?.summary || res.text,
        sections: parsed?.sections || [],
        highlights: parsed?.highlights || [],
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error('AI summary generation failed', err?.message);
      return {
        summary: `AIサマリー生成エラー: ${err?.message || '不明'}`,
        highlights: [],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // =========================================
  // #10: AIトークスクリプト
  // =========================================
  async generateTalkScript(orgId: string, fiscalYear?: number): Promise<TalkScript> {
    const { dashboard, plRows } = await this.getFinancialContext(orgId, fiscalYear);

    try {
      const llm = this.ensureLlm();
      const prompt = `あなたは会計事務所の顧問担当者です。月次報告会議で顧問先の社長に対して話す原稿を作成してください。数字を具体的に引用し、会話調で話しやすい文章にしてください。

${this.financialDataBlock(dashboard, plRows)}

## 出力形式（JSON）
{"opening":"挨拶と全体感（2-3文）","sections":[{"title":"セクション名","content":"話す内容（3-5文）","qa":[{"q":"想定質問","a":"回答例"}]}],"closing":"まとめと次回アクション（2-3文）"}

セクションは以下の3つ:
1. 売上・利益の状況
2. 資金繰り・キャッシュ
3. 今後の課題と提案`;

      const res = await llm.generate(prompt, { maxTokens: 2048, json: true });
      const parsed = extractJson<Omit<TalkScript, 'generatedAt'>>(res.text);

      return {
        opening: parsed?.opening || '',
        sections: parsed?.sections || [],
        closing: parsed?.closing || '',
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
  ): Promise<BudgetScenario[]> {
    const { dashboard, plRows } = await this.getFinancialContext(orgId, fiscalYear);

    const paramBlock = params
      ? `\n## ユーザー指定パラメータ（これを前提条件として必ず反映すること）
${params.baseGrowthRate !== undefined ? `- Base売上成長率: ${params.baseGrowthRate}%\n` : ''}${params.upsideGrowthRate !== undefined ? `- Upside売上成長率: ${params.upsideGrowthRate}%\n` : ''}${params.downsideGrowthRate !== undefined ? `- Downside売上成長率: ${params.downsideGrowthRate}%\n` : ''}${params.newHires !== undefined ? `- 採用予定人数: ${params.newHires}名\n` : ''}${params.costReductionRate !== undefined ? `- コスト削減率: ${params.costReductionRate}%\n` : ''}${params.notes ? `- 補足: ${params.notes}\n` : ''}`
      : '';

    try {
      const llm = this.ensureLlm();
      const prompt = `あなたは会計事務所の経営コンサルタントです。以下の今期実績データに基づき、来期の予算を3つのシナリオで提案してください。
ユーザー指定パラメータがある場合は、それを前提条件として必ず反映してください。パラメータが指定されていない項目は、実績データから合理的に推定してください。

${this.financialDataBlock(dashboard, plRows)}
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
  async generateFundingReport(orgId: string, fiscalYear?: number): Promise<FundingReport> {
    const { dashboard, plRows } = await this.getFinancialContext(orgId, fiscalYear);

    try {
      const llm = this.ensureLlm();
      const prompt = `あなたは投資家・金融機関向けの資金調達レポートを作成する専門家です。以下の財務データに基づき、資金調達用のレポートを作成してください。

${this.financialDataBlock(dashboard, plRows)}

## 出力形式（JSON）
{"executiveSummary":"事業概要と資金ニーズ（3-5文）","financialHighlights":["財務ハイライト1","ハイライト2","ハイライト3"],"strengthsRisks":{"strengths":["強み1","強み2"],"risks":["リスク1","リスク2"]},"projections":"今後の見通し（3-5文）"}`;

      const res = await llm.generate(prompt, { maxTokens: 2048, json: true });
      const parsed = extractJson<Omit<FundingReport, 'generatedAt'>>(res.text);

      return {
        executiveSummary: parsed?.executiveSummary || '',
        financialHighlights: parsed?.financialHighlights || [],
        strengthsRisks: parsed?.strengthsRisks || { strengths: [], risks: [] },
        projections: parsed?.projections || '',
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error('Funding report generation failed', err?.message);
      return {
        executiveSummary: `生成エラー: ${err?.message}`,
        financialHighlights: [],
        strengthsRisks: { strengths: [], risks: [] },
        projections: '',
        generatedAt: new Date().toISOString(),
      };
    }
  }
}
