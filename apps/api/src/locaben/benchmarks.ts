/**
 * ロカベン6指標 + 業種別 median ベンチマーク (API 側コピー)。
 * 出典/単位は web 側 `apps/web/src/lib/locaben/constants.ts` と完全同期させること。
 */

import type { IndustryCode } from '../common/industries';
import type { LocabenSourceData } from './locaben.service';

export const LOCABEN_METRIC_KEYS = [
  'revenueGrowthRate',
  'operatingProfitMargin',
  'laborProductivity',
  'ebitdaInterestBearingDebtRatio',
  'workingCapitalTurnoverPeriod',
  'equityRatio',
] as const;

export type LocabenMetricKey = (typeof LOCABEN_METRIC_KEYS)[number];

export const LOCABEN_METRIC_LABELS: Record<LocabenMetricKey, string> = {
  revenueGrowthRate: '売上増加率(%)',
  operatingProfitMargin: '営業利益率(%)',
  laborProductivity: '労働生産性(千円/人)',
  ebitdaInterestBearingDebtRatio: 'EBITDA有利子負債倍率(倍)',
  workingCapitalTurnoverPeriod: '営業運転資本回転期間(ヶ月)',
  equityRatio: '自己資本比率(%)',
};

export const LOCABEN_HIGHER_IS_BETTER: Record<LocabenMetricKey, boolean> = {
  revenueGrowthRate: true,
  operatingProfitMargin: true,
  laborProductivity: true,
  ebitdaInterestBearingDebtRatio: false,
  workingCapitalTurnoverPeriod: false,
  equityRatio: true,
};

export const LOCABEN_BENCHMARKS: Record<
  IndustryCode,
  Record<LocabenMetricKey, number>
> = {
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
  '運輸業・郵便業': {
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
  '不動産業・物品賃貸業': {
    revenueGrowthRate: 1.0,
    operatingProfitMargin: 8.0,
    laborProductivity: 9000,
    ebitdaInterestBearingDebtRatio: 8.0,
    workingCapitalTurnoverPeriod: 0.8,
    equityRatio: 40,
  },
  '学術研究・専門・技術サービス業': {
    revenueGrowthRate: 3.0,
    operatingProfitMargin: 7.0,
    laborProductivity: 6500,
    ebitdaInterestBearingDebtRatio: 2.0,
    workingCapitalTurnoverPeriod: 1.5,
    equityRatio: 50,
  },
  '宿泊業・飲食サービス業': {
    revenueGrowthRate: 2.5,
    operatingProfitMargin: 2.0,
    laborProductivity: 2800,
    ebitdaInterestBearingDebtRatio: 5.0,
    workingCapitalTurnoverPeriod: 0.4,
    equityRatio: 25,
  },
  '生活関連サービス業・娯楽業': {
    revenueGrowthRate: 1.5,
    operatingProfitMargin: 3.0,
    laborProductivity: 3000,
    ebitdaInterestBearingDebtRatio: 4.5,
    workingCapitalTurnoverPeriod: 0.5,
    equityRatio: 30,
  },
  '教育・学習支援業': {
    revenueGrowthRate: 2.0,
    operatingProfitMargin: 4.0,
    laborProductivity: 3200,
    ebitdaInterestBearingDebtRatio: 3.0,
    workingCapitalTurnoverPeriod: 0.8,
    equityRatio: 40,
  },
  '医療・福祉': {
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

export const LOCABEN_DEFAULT_BENCHMARK: Record<LocabenMetricKey, number> = {
  revenueGrowthRate: 2.0,
  operatingProfitMargin: 3.5,
  laborProductivity: 4500,
  ebitdaInterestBearingDebtRatio: 4.0,
  workingCapitalTurnoverPeriod: 1.5,
  equityRatio: 40,
};

export function getBenchmarkFor(
  industry: IndustryCode | null | undefined,
): Record<LocabenMetricKey, number> {
  if (!industry) return LOCABEN_DEFAULT_BENCHMARK;
  return LOCABEN_BENCHMARKS[industry] ?? LOCABEN_DEFAULT_BENCHMARK;
}

/**
 * 非財務4シート定義 (web 側 NON_FINANCIAL_SECTIONS と同期)。
 * AI プロンプトでラベル変換に使う。
 */
export const NON_FINANCIAL_SECTIONS: ReadonlyArray<{
  key: string;
  label: string;
  fields: ReadonlyArray<{ key: string; label: string }>;
}> = [
  {
    key: 'manager',
    label: '経営者',
    fields: [
      { key: 'career', label: '経営者の経歴' },
      { key: 'strength', label: '経営者の強み' },
      { key: 'weakness', label: '経営者の弱み' },
      { key: 'philosophy', label: '経営理念・ビジョン' },
      { key: 'successor', label: '後継者の有無・育成状況' },
    ],
  },
  {
    key: 'stakeholders',
    label: '事業を取り巻く環境・関係者',
    fields: [
      { key: 'shareholders', label: '株主構成' },
      { key: 'customers', label: '主要顧客・販売先' },
      { key: 'suppliers', label: '主要仕入先' },
      { key: 'employees', label: '従業員構成 (人数・年齢・スキル)' },
      { key: 'banks', label: '取引金融機関' },
    ],
  },
  {
    key: 'business',
    label: '事業',
    fields: [
      { key: 'products', label: '商品・サービス' },
      { key: 'customerNeeds', label: '顧客のニーズ・対応方針' },
      { key: 'deliveryMethod', label: '提供方法・販路' },
      { key: 'competitors', label: '競合との差別化要因' },
      { key: 'valueChain', label: 'バリューチェーン上の位置' },
    ],
  },
  {
    key: 'internal',
    label: '内部管理体制',
    fields: [
      { key: 'orgStructure', label: '組織体制・組織図' },
      { key: 'decisionMaking', label: '意思決定プロセス' },
      { key: 'humanResources', label: '人事評価・育成制度' },
      { key: 'ITSystems', label: '情報システム・DX取り組み' },
      { key: 'compliance', label: '内部統制・コンプライアンス' },
    ],
  },
];

/** 非財務シート (定性情報) を prompt 用テキストに整形。1項目も入力が無ければ空文字を返す。 */
export function formatNonFinancialBlock(
  nonFinancial:
    | Record<string, Record<string, string>>
    | undefined,
): string {
  if (!nonFinancial) return '';
  const lines: string[] = [];
  for (const section of NON_FINANCIAL_SECTIONS) {
    const data = nonFinancial[section.key];
    if (!data) continue;
    const entries = section.fields
      .map((f) => ({ label: f.label, value: (data[f.key] ?? '').trim() }))
      .filter((e) => e.value.length > 0);
    if (entries.length === 0) continue;
    lines.push(`### ${section.label}`);
    for (const e of entries) {
      lines.push(`- ${e.label}: ${e.value}`);
    }
    lines.push('');
  }
  if (lines.length === 0) return '';
  return ['## ロカベン非財務シート (ユーザー入力済みの定性情報)', ...lines].join(
    '\n',
  );
}

/** SourceData (千円単位) から6指標を計算 */
export function computeLocabenMetrics(
  d: LocabenSourceData,
): Record<LocabenMetricKey, number | null> {
  const safe = (v: number | null) =>
    v !== null && Number.isFinite(v) ? v : null;
  const rev = safe(d.revenueCurrent);
  const revPrior = safe(d.revenuePrior);
  const op = safe(d.operatingProfit);
  const dep = safe(d.depreciation);
  const ta = safe(d.totalAssets);
  const na = safe(d.netAssets);
  const ar = safe(d.receivables);
  const inv = safe(d.inventory);
  const ap = safe(d.payables);
  const debt = safe(d.borrowings);
  const cash = safe(d.cashAndDeposits);
  const emp = safe(d.employeeCount);

  const revenueGrowthRate =
    rev !== null && revPrior !== null && revPrior !== 0
      ? ((rev - revPrior) / revPrior) * 100
      : null;
  const opMargin =
    rev !== null && rev !== 0 && op !== null ? (op / rev) * 100 : null;
  const laborProductivity =
    op !== null && emp !== null && emp > 0 ? op / emp : null;
  const ebitda =
    debt !== null && cash !== null && op !== null && dep !== null
      ? op + dep !== 0
        ? (debt - cash) / (op + dep)
        : null
      : null;
  const wc =
    ar !== null && inv !== null && ap !== null && rev !== null && rev > 0
      ? (ar + inv - ap) / (rev / 12)
      : null;
  const equityRatio =
    na !== null && ta !== null && ta !== 0 ? (na / ta) * 100 : null;

  return {
    revenueGrowthRate,
    operatingProfitMargin: opMargin,
    laborProductivity,
    ebitdaInterestBearingDebtRatio: ebitda,
    workingCapitalTurnoverPeriod: wc,
    equityRatio,
  };
}
