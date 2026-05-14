/**
 * ロカベン (経済産業省ローカルベンチマーク) 定義。
 *
 * 公式: https://www.meti.go.jp/policy/economy/keiei_innovation/sangyokinyu/locaben/
 *
 * 財務6指標と業種別 median 値。median は中小企業実態基本調査・TKC経営指標を
 * 参考にした概算値。q75/q90 は最小実装では持たない (健康サマリー側で別途保有)。
 *
 * 業種マスタは既存 INDUSTRIES (13業種) をそのまま使用 (マッピング不要)。
 */

import type { IndustryCode } from "../industries";
import { INDUSTRIES } from "../industries";

export const LOCABEN_METRIC_KEYS = [
  "revenueGrowthRate",
  "operatingProfitMargin",
  "laborProductivity",
  "ebitdaInterestBearingDebtRatio",
  "workingCapitalTurnoverPeriod",
  "equityRatio",
] as const;

export type LocabenMetricKey = (typeof LOCABEN_METRIC_KEYS)[number];

export interface LocabenMetricDef {
  key: LocabenMetricKey;
  label: string;
  unit: string;
  /** 計算式の説明 (Excel出力にも使用) */
  formula: string;
  /** 1-2行の意味 */
  meaning: string;
  /** true: 値が大きいほど良い / false: 小さいほど良い */
  higherIsBetter: boolean;
}

export const LOCABEN_METRICS: Record<LocabenMetricKey, LocabenMetricDef> = {
  revenueGrowthRate: {
    key: "revenueGrowthRate",
    label: "売上増加率",
    unit: "%",
    formula: "(当期売上 − 前期売上) ÷ 前期売上 × 100",
    meaning: "事業規模の成長性。マイナスは縮小、プラスは成長を示す。",
    higherIsBetter: true,
  },
  operatingProfitMargin: {
    key: "operatingProfitMargin",
    label: "営業利益率",
    unit: "%",
    formula: "営業利益 ÷ 売上 × 100",
    meaning: "本業の収益力。同業平均との比較で事業効率を判断する。",
    higherIsBetter: true,
  },
  laborProductivity: {
    key: "laborProductivity",
    label: "労働生産性",
    unit: "千円/人",
    formula: "営業利益 ÷ 従業員数 (千円単位)",
    meaning: "1人あたりが生み出す利益。人的資本の活用度を測る。",
    higherIsBetter: true,
  },
  ebitdaInterestBearingDebtRatio: {
    key: "ebitdaInterestBearingDebtRatio",
    label: "EBITDA有利子負債倍率",
    unit: "倍",
    formula: "(借入金 − 現預金) ÷ (営業利益 + 減価償却費)",
    meaning: "実質有利子負債を何年分のキャッシュ創出力で返せるか。低いほど健全。",
    higherIsBetter: false,
  },
  workingCapitalTurnoverPeriod: {
    key: "workingCapitalTurnoverPeriod",
    label: "営業運転資本回転期間",
    unit: "ヶ月",
    formula: "(売上債権 + 棚卸資産 − 仕入債務) ÷ (売上 ÷ 12)",
    meaning: "運転資金の滞留期間。短いほど資金効率が良い。",
    higherIsBetter: false,
  },
  equityRatio: {
    key: "equityRatio",
    label: "自己資本比率",
    unit: "%",
    formula: "純資産 ÷ 総資産 × 100",
    meaning: "財務基盤の安定性。高いほど倒産リスクが低い。",
    higherIsBetter: true,
  },
};

/**
 * 業種別 median 値 (6指標 × 13業種)。
 * 出典: 中小企業実態基本調査 + TKC経営指標 (概算)。
 * 単位:
 *   revenueGrowthRate, operatingProfitMargin, equityRatio: %
 *   laborProductivity: 千円/人
 *   ebitdaInterestBearingDebtRatio: 倍
 *   workingCapitalTurnoverPeriod: ヶ月
 */
export const LOCABEN_BENCHMARKS: Record<IndustryCode, Record<LocabenMetricKey, number>> = {
  建設業: {
    revenueGrowthRate: 2.0,
    operatingProfitMargin: 3.5,
    laborProductivity: 5500,
    ebitdaInterestBearingDebtRatio: 3.5,
    workingCapitalTurnoverPeriod: 2.5,
    equityRatio: 42,
  },
  製造業: {
    revenueGrowthRate: 1.5,
    operatingProfitMargin: 4.0,
    laborProductivity: 5800,
    ebitdaInterestBearingDebtRatio: 4.0,
    workingCapitalTurnoverPeriod: 2.8,
    equityRatio: 47,
  },
  情報通信業: {
    revenueGrowthRate: 5.0,
    operatingProfitMargin: 6.0,
    laborProductivity: 7000,
    ebitdaInterestBearingDebtRatio: 2.5,
    workingCapitalTurnoverPeriod: 1.8,
    equityRatio: 52,
  },
  "運輸業・郵便業": {
    revenueGrowthRate: 1.0,
    operatingProfitMargin: 2.5,
    laborProductivity: 4200,
    ebitdaInterestBearingDebtRatio: 5.5,
    workingCapitalTurnoverPeriod: 1.5,
    equityRatio: 35,
  },
  卸売業: {
    revenueGrowthRate: 2.0,
    operatingProfitMargin: 2.0,
    laborProductivity: 5000,
    ebitdaInterestBearingDebtRatio: 4.5,
    workingCapitalTurnoverPeriod: 2.2,
    equityRatio: 38,
  },
  小売業: {
    revenueGrowthRate: 1.5,
    operatingProfitMargin: 2.5,
    laborProductivity: 3500,
    ebitdaInterestBearingDebtRatio: 4.0,
    workingCapitalTurnoverPeriod: 1.2,
    equityRatio: 36,
  },
  "不動産業・物品賃貸業": {
    revenueGrowthRate: 1.0,
    operatingProfitMargin: 8.0,
    laborProductivity: 9000,
    ebitdaInterestBearingDebtRatio: 8.0,
    workingCapitalTurnoverPeriod: 0.8,
    equityRatio: 40,
  },
  "学術研究・専門・技術サービス業": {
    revenueGrowthRate: 3.0,
    operatingProfitMargin: 7.0,
    laborProductivity: 6500,
    ebitdaInterestBearingDebtRatio: 2.0,
    workingCapitalTurnoverPeriod: 1.5,
    equityRatio: 50,
  },
  "宿泊業・飲食サービス業": {
    revenueGrowthRate: 2.5,
    operatingProfitMargin: 2.0,
    laborProductivity: 2800,
    ebitdaInterestBearingDebtRatio: 5.0,
    workingCapitalTurnoverPeriod: 0.4,
    equityRatio: 25,
  },
  "生活関連サービス業・娯楽業": {
    revenueGrowthRate: 1.5,
    operatingProfitMargin: 3.0,
    laborProductivity: 3000,
    ebitdaInterestBearingDebtRatio: 4.5,
    workingCapitalTurnoverPeriod: 0.5,
    equityRatio: 30,
  },
  "教育・学習支援業": {
    revenueGrowthRate: 2.0,
    operatingProfitMargin: 4.0,
    laborProductivity: 3200,
    ebitdaInterestBearingDebtRatio: 3.0,
    workingCapitalTurnoverPeriod: 0.8,
    equityRatio: 40,
  },
  "医療・福祉": {
    revenueGrowthRate: 2.0,
    operatingProfitMargin: 3.5,
    laborProductivity: 3800,
    ebitdaInterestBearingDebtRatio: 4.0,
    workingCapitalTurnoverPeriod: 1.2,
    equityRatio: 38,
  },
  その他サービス業: {
    revenueGrowthRate: 2.0,
    operatingProfitMargin: 4.0,
    laborProductivity: 4000,
    ebitdaInterestBearingDebtRatio: 3.5,
    workingCapitalTurnoverPeriod: 1.5,
    equityRatio: 40,
  },
};

/** 業種未設定時のフォールバック (全業種平均ベース) */
export const LOCABEN_DEFAULT_BENCHMARK: Record<LocabenMetricKey, number> = {
  revenueGrowthRate: 2.0,
  operatingProfitMargin: 3.5,
  laborProductivity: 4500,
  ebitdaInterestBearingDebtRatio: 4.0,
  workingCapitalTurnoverPeriod: 1.5,
  equityRatio: 40,
};

export function getBenchmarkFor(
  industry: IndustryCode | null,
): Record<LocabenMetricKey, number> {
  if (!industry) return LOCABEN_DEFAULT_BENCHMARK;
  return LOCABEN_BENCHMARKS[industry] ?? LOCABEN_DEFAULT_BENCHMARK;
}

/** 非財務4枚 (経営者 / 関係者 / 事業 / 内部管理体制) の項目定義 */
export const NON_FINANCIAL_SECTIONS = [
  {
    key: "manager",
    label: "経営者",
    fields: [
      { key: "career", label: "経営者の経歴" },
      { key: "strength", label: "経営者の強み" },
      { key: "weakness", label: "経営者の弱み" },
      { key: "philosophy", label: "経営理念・ビジョン" },
      { key: "successor", label: "後継者の有無・育成状況" },
    ],
  },
  {
    key: "stakeholders",
    label: "事業を取り巻く環境・関係者",
    fields: [
      { key: "shareholders", label: "株主構成" },
      { key: "customers", label: "主要顧客・販売先" },
      { key: "suppliers", label: "主要仕入先" },
      { key: "employees", label: "従業員構成 (人数・年齢・スキル)" },
      { key: "banks", label: "取引金融機関" },
    ],
  },
  {
    key: "business",
    label: "事業",
    fields: [
      { key: "products", label: "商品・サービス" },
      { key: "customerNeeds", label: "顧客のニーズ・対応方針" },
      { key: "deliveryMethod", label: "提供方法・販路" },
      { key: "competitors", label: "競合との差別化要因" },
      { key: "valueChain", label: "バリューチェーン上の位置" },
    ],
  },
  {
    key: "internal",
    label: "内部管理体制",
    fields: [
      { key: "orgStructure", label: "組織体制・組織図" },
      { key: "decisionMaking", label: "意思決定プロセス" },
      { key: "humanResources", label: "人事評価・育成制度" },
      { key: "ITSystems", label: "情報システム・DX取り組み" },
      { key: "compliance", label: "内部統制・コンプライアンス" },
    ],
  },
] as const;

export const ALL_INDUSTRIES = INDUSTRIES;
