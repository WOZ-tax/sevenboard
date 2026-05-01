import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createLlmProvider } from '../ai/llm-provider';
import type { FinancialIndicators } from '../mf/types/mf-api.types';
import type { HealthScoreBreakdown } from './health-score-calculator';

/**
 * AI CFO の「今月の経営者に聞くべき 5 問」生成。
 *
 * 当月の指標 + 前月比 + 健康スコア breakdown を Claude に渡し、
 * 経営者に向けた具体的な問いを生成する。
 *
 * トークンコスト管理:
 *   - 1 スナップショット (1 月) につき LLM 呼び出し 1 回まで
 *   - 上書き再計算 (refresh) でも 1 回ずつ
 *   - LLM プロバイダ未設定時はフォールバックの定型 5 問を返す
 */
@Injectable()
export class HealthQuestionsService {
  private readonly logger = new Logger('HealthQuestionsService');

  constructor(private httpService: HttpService) {}

  /**
   * AI 5 問を生成。LLM 失敗時はフォールバックの定型問いを返す (空配列にしない)。
   *
   * 経営コンテキスト・業種・HP URL を prompt に注入することで、業種だけでは
   * 表現できない会社固有の事情を踏まえた問いになる。
   */
  async generate(input: {
    fiscalYear: number;
    month: number;
    score: number;
    prevScore: number | null;
    breakdown: HealthScoreBreakdown;
    indicators: FinancialIndicators;
    industry?: string | null;
    websiteUrl?: string | null;
    businessContext?: string | null;
    industryHint?: string;
  }): Promise<string[]> {
    const provider = createLlmProvider(this.httpService);
    if (!provider) {
      this.logger.log('LLM provider not configured. Using fallback questions.');
      return this.fallbackQuestions(input);
    }

    const prompt = this.buildPrompt(input);
    const response = await provider
      .generate(prompt, { maxTokens: 1500, json: true })
      .catch((err) => {
        this.logger.warn(`LLM generate failed: ${err}`);
        return null;
      });
    if (!response?.text) return this.fallbackQuestions(input);

    const parsed = parseQuestions(response.text);
    if (!parsed || parsed.length === 0) {
      this.logger.warn('LLM response failed to parse. Using fallback.');
      return this.fallbackQuestions(input);
    }
    return parsed.slice(0, 5);
  }

  private buildPrompt(input: {
    fiscalYear: number;
    month: number;
    score: number;
    prevScore: number | null;
    breakdown: HealthScoreBreakdown;
    indicators: FinancialIndicators;
    industry?: string | null;
    websiteUrl?: string | null;
    businessContext?: string | null;
    industryHint?: string;
  }): string {
    const period = `${input.fiscalYear}年${input.month}月`;
    const delta =
      input.prevScore !== null
        ? `${input.score - input.prevScore >= 0 ? '+' : ''}${input.score - input.prevScore}`
        : 'N/A';

    const companyInfoLines: string[] = [];
    if (input.industry) companyInfoLines.push(`業種: ${input.industry}`);
    if (input.websiteUrl) companyInfoLines.push(`HP: ${input.websiteUrl}`);
    if (input.businessContext) {
      companyInfoLines.push(`経営コンテキスト:\n${input.businessContext}`);
    }
    const companyInfoBlock = companyInfoLines.length
      ? `\n【会社情報】\n${companyInfoLines.join('\n')}\n`
      : '';

    return `あなたは中小企業に常駐する AI CFO です。
${period} の経営健康スナップショットを元に、社長と顧問が来月までに確認・議論すべき具体的な問いを 5 つ生成してください。
${companyInfoBlock}
【健康スコア】
総合: ${input.score}/100 (前月比: ${delta})
活動性 (収益性): ${input.breakdown.activity}/40
安全性: ${input.breakdown.safety}/40
効率性: ${input.breakdown.efficiency}/20

【主要財務指標 (当月時点)】
- 営業利益率: ${input.indicators.operatingProfitMargin}%
- ROE: ${input.indicators.roe}%
- ROA: ${input.indicators.roa}%
- 流動比率: ${input.indicators.currentRatio}%
- 自己資本比率: ${input.indicators.equityRatio}%
- 負債比率: ${input.indicators.debtEquityRatio}%
- 総資産回転率: ${input.indicators.totalAssetTurnover} 回
- 売上債権回転率: ${input.indicators.receivablesTurnover} 回
${input.industryHint ? `\n【業種ヒント】\n${input.industryHint}` : ''}

【出力形式】
JSON で以下の形式:
{
  "questions": ["問い 1", "問い 2", "問い 3", "問い 4", "問い 5"]
}

【ガイドライン】
1. 単に数字を聞くのではなく、経営判断につながる問いを立てる
   悪い例: "売上はいくらでしたか？"
   良い例: "売上が前月比 -15% ですが、特定大口顧客の解約や季節要因のいずれが主因ですか？"
2. 数字の変動が大きい指標を優先的に取り上げる
3. 当社固有の事情を引き出す問い (大口取引先、人員、季節要因、市場環境)
4. 1 問は短く、各 80 文字以内
5. 出力は JSON 1 つのみ。マークダウンや前置きは不要
`;
  }

  /**
   * LLM 利用不能時の定型問い。スコア帯に応じてトーンを変える。
   */
  private fallbackQuestions(input: {
    score: number;
    prevScore: number | null;
    indicators: FinancialIndicators;
  }): string[] {
    const base = [
      `当月の売上 (営業利益率 ${input.indicators.operatingProfitMargin}%) は、計画と比較してどうでしたか。差異の主因は何ですか。`,
      `売上債権回転率は ${input.indicators.receivablesTurnover} 回です。回収サイトの長期化があれば、特定取引先を教えてください。`,
      `流動比率 ${input.indicators.currentRatio}% で、3 ヶ月先の資金繰りに不安はありますか。`,
    ];

    if (input.prevScore !== null && input.score < input.prevScore - 2) {
      base.push(
        `健康スコアが前月から ${input.prevScore - input.score} pt 低下しました。最も気になっている指標はどこですか。`,
      );
    } else {
      base.push(
        '今月起こった経営上の出来事 (新規受注・大口失注・人員変動など) で来月以降に影響しそうなものはありますか。',
      );
    }
    base.push(
      '今後 3 ヶ月で投資 (人員増・設備・広告) を検討している項目はありますか。',
    );
    return base.slice(0, 5);
  }
}

function parseQuestions(text: string): string[] | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { questions?: unknown };
    if (!Array.isArray(obj.questions)) return null;
    return obj.questions
      .filter((q): q is string => typeof q === 'string')
      .map((q) => q.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}
