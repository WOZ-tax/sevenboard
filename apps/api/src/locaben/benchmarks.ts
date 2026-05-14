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
