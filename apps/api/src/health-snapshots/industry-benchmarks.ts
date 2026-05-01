/**
 * 業種別ベンチマーク。
 * 中小企業庁「中小企業実態基本調査」(法人企業の経営指標) を参考にした標準値。
 * 出典: https://www.chusho.meti.go.jp/koukai/chousa/jittai/
 *
 * 数値は概算で、税理士が eyeball レビューする前提。各業種で:
 *   - median: 業界中央値 (50% の企業がここを達成)
 *   - q75:    上位 25% のライン (より優秀)
 *   - q90:    上位 10% のライン (トップクラス)
 *
 * 「高いほど良い指標」(operatingProfitMargin / roe / roa / currentRatio /
 *  equityRatio / totalAssetTurnover / receivablesTurnover):
 *   q90 > q75 > median の順で大きくなる
 *
 * 「低いほど良い指標」(debtEquityRatio = 負債比率):
 *   q90 < q75 < median の順で小さくなる (低いほど財務健全)
 *
 * 業種未設定 (industry = null or 旧値) のケースは ALL_INDUSTRY_AVERAGE を使う。
 */

import type { IndustryCode } from '../common/industries';

export interface BenchmarkValues {
  median: number;
  q75: number;
  q90: number;
}

export interface IndustryBenchmark {
  /** 営業利益率 (%) */
  operatingProfitMargin: BenchmarkValues;
  /** ROE (%) */
  roe: BenchmarkValues;
  /** ROA (%) */
  roa: BenchmarkValues;
  /** 流動比率 (%) */
  currentRatio: BenchmarkValues;
  /** 自己資本比率 (%) */
  equityRatio: BenchmarkValues;
  /** 負債比率 (%) — 低いほど良い指標 */
  debtEquityRatio: BenchmarkValues;
  /** 総資産回転率 (回) */
  totalAssetTurnover: BenchmarkValues;
  /** 売上債権回転率 (回) */
  receivablesTurnover: BenchmarkValues;
}

export const INDUSTRY_BENCHMARKS: Record<IndustryCode, IndustryBenchmark> = {
  建設業: {
    operatingProfitMargin: { median: 3.5, q75: 6.0, q90: 10.0 },
    roe: { median: 8.0, q75: 13.0, q90: 18.0 },
    roa: { median: 3.0, q75: 5.0, q90: 8.0 },
    currentRatio: { median: 150, q75: 200, q90: 300 },
    equityRatio: { median: 42, q75: 55, q90: 70 },
    debtEquityRatio: { median: 140, q75: 80, q90: 40 },
    totalAssetTurnover: { median: 1.1, q75: 1.5, q90: 2.0 },
    receivablesTurnover: { median: 6, q75: 9, q90: 12 },
  },
  製造業: {
    operatingProfitMargin: { median: 4.0, q75: 7.0, q90: 11.0 },
    roe: { median: 7.5, q75: 12.0, q90: 18.0 },
    roa: { median: 3.5, q75: 6.0, q90: 9.0 },
    currentRatio: { median: 170, q75: 230, q90: 320 },
    equityRatio: { median: 47, q75: 60, q90: 75 },
    debtEquityRatio: { median: 110, q75: 60, q90: 30 },
    totalAssetTurnover: { median: 0.9, q75: 1.3, q90: 1.7 },
    receivablesTurnover: { median: 5, q75: 7, q90: 10 },
  },
  情報通信業: {
    operatingProfitMargin: { median: 6.0, q75: 10.0, q90: 18.0 },
    roe: { median: 10.0, q75: 16.0, q90: 25.0 },
    roa: { median: 5.0, q75: 9.0, q90: 14.0 },
    currentRatio: { median: 200, q75: 280, q90: 400 },
    equityRatio: { median: 52, q75: 65, q90: 80 },
    debtEquityRatio: { median: 90, q75: 50, q90: 25 },
    totalAssetTurnover: { median: 1.0, q75: 1.4, q90: 1.8 },
    receivablesTurnover: { median: 7, q75: 10, q90: 14 },
  },
  '運輸業・郵便業': {
    operatingProfitMargin: { median: 2.5, q75: 4.5, q90: 7.0 },
    roe: { median: 6.0, q75: 10.0, q90: 15.0 },
    roa: { median: 2.5, q75: 4.5, q90: 7.0 },
    currentRatio: { median: 130, q75: 180, q90: 260 },
    equityRatio: { median: 32, q75: 45, q90: 60 },
    debtEquityRatio: { median: 200, q75: 120, q90: 65 },
    totalAssetTurnover: { median: 1.2, q75: 1.6, q90: 2.0 },
    receivablesTurnover: { median: 8, q75: 11, q90: 14 },
  },
  卸売業: {
    operatingProfitMargin: { median: 1.5, q75: 3.0, q90: 5.5 },
    roe: { median: 7.0, q75: 12.0, q90: 18.0 },
    roa: { median: 2.5, q75: 4.5, q90: 7.5 },
    currentRatio: { median: 145, q75: 195, q90: 280 },
    equityRatio: { median: 37, q75: 50, q90: 65 },
    debtEquityRatio: { median: 170, q75: 100, q90: 55 },
    totalAssetTurnover: { median: 1.7, q75: 2.3, q90: 3.0 },
    receivablesTurnover: { median: 7, q75: 10, q90: 13 },
  },
  小売業: {
    operatingProfitMargin: { median: 1.8, q75: 3.5, q90: 6.0 },
    roe: { median: 6.5, q75: 11.0, q90: 17.0 },
    roa: { median: 2.5, q75: 4.5, q90: 7.5 },
    currentRatio: { median: 140, q75: 190, q90: 270 },
    equityRatio: { median: 32, q75: 48, q90: 65 },
    debtEquityRatio: { median: 200, q75: 110, q90: 55 },
    totalAssetTurnover: { median: 1.6, q75: 2.2, q90: 2.9 },
    receivablesTurnover: { median: 12, q75: 18, q90: 25 },
  },
  '不動産業・物品賃貸業': {
    operatingProfitMargin: { median: 9.0, q75: 16.0, q90: 28.0 },
    roe: { median: 6.5, q75: 12.0, q90: 18.0 },
    roa: { median: 3.0, q75: 5.5, q90: 9.0 },
    currentRatio: { median: 155, q75: 220, q90: 330 },
    equityRatio: { median: 32, q75: 48, q90: 65 },
    debtEquityRatio: { median: 200, q75: 110, q90: 55 },
    totalAssetTurnover: { median: 0.4, q75: 0.7, q90: 1.0 },
    receivablesTurnover: { median: 10, q75: 14, q90: 20 },
  },
  '学術研究・専門・技術サービス業': {
    operatingProfitMargin: { median: 5.5, q75: 9.5, q90: 16.0 },
    roe: { median: 9.0, q75: 14.0, q90: 22.0 },
    roa: { median: 4.5, q75: 7.5, q90: 12.0 },
    currentRatio: { median: 195, q75: 280, q90: 400 },
    equityRatio: { median: 50, q75: 63, q90: 78 },
    debtEquityRatio: { median: 95, q75: 55, q90: 28 },
    totalAssetTurnover: { median: 1.0, q75: 1.4, q90: 1.8 },
    receivablesTurnover: { median: 7, q75: 10, q90: 14 },
  },
  '宿泊業・飲食サービス業': {
    operatingProfitMargin: { median: 2.5, q75: 4.5, q90: 8.0 },
    roe: { median: 5.5, q75: 10.0, q90: 16.0 },
    roa: { median: 2.0, q75: 4.0, q90: 7.0 },
    currentRatio: { median: 110, q75: 150, q90: 220 },
    equityRatio: { median: 27, q75: 42, q90: 60 },
    debtEquityRatio: { median: 250, q75: 140, q90: 70 },
    totalAssetTurnover: { median: 1.0, q75: 1.4, q90: 1.8 },
    receivablesTurnover: { median: 20, q75: 30, q90: 50 },
  },
  '生活関連サービス業・娯楽業': {
    operatingProfitMargin: { median: 3.0, q75: 5.5, q90: 9.5 },
    roe: { median: 6.0, q75: 11.0, q90: 17.0 },
    roa: { median: 2.5, q75: 4.5, q90: 7.5 },
    currentRatio: { median: 130, q75: 180, q90: 260 },
    equityRatio: { median: 33, q75: 48, q90: 65 },
    debtEquityRatio: { median: 200, q75: 110, q90: 55 },
    totalAssetTurnover: { median: 1.0, q75: 1.4, q90: 1.8 },
    receivablesTurnover: { median: 15, q75: 22, q90: 35 },
  },
  '教育・学習支援業': {
    operatingProfitMargin: { median: 5.0, q75: 8.5, q90: 14.0 },
    roe: { median: 7.5, q75: 12.5, q90: 19.0 },
    roa: { median: 3.5, q75: 6.0, q90: 9.5 },
    currentRatio: { median: 160, q75: 220, q90: 320 },
    equityRatio: { median: 40, q75: 55, q90: 70 },
    debtEquityRatio: { median: 150, q75: 85, q90: 45 },
    totalAssetTurnover: { median: 0.9, q75: 1.3, q90: 1.7 },
    receivablesTurnover: { median: 10, q75: 15, q90: 22 },
  },
  '医療・福祉': {
    operatingProfitMargin: { median: 4.5, q75: 8.0, q90: 13.0 },
    roe: { median: 7.0, q75: 11.5, q90: 17.0 },
    roa: { median: 3.5, q75: 6.0, q90: 9.5 },
    currentRatio: { median: 150, q75: 210, q90: 300 },
    equityRatio: { median: 33, q75: 48, q90: 65 },
    debtEquityRatio: { median: 200, q75: 110, q90: 55 },
    totalAssetTurnover: { median: 0.9, q75: 1.3, q90: 1.7 },
    receivablesTurnover: { median: 8, q75: 12, q90: 18 },
  },
  その他サービス業: {
    operatingProfitMargin: { median: 4.0, q75: 7.0, q90: 12.0 },
    roe: { median: 7.5, q75: 12.0, q90: 18.0 },
    roa: { median: 3.5, q75: 6.0, q90: 9.5 },
    currentRatio: { median: 165, q75: 230, q90: 330 },
    equityRatio: { median: 40, q75: 55, q90: 70 },
    debtEquityRatio: { median: 150, q75: 85, q90: 45 },
    totalAssetTurnover: { median: 1.0, q75: 1.4, q90: 1.8 },
    receivablesTurnover: { median: 8, q75: 12, q90: 17 },
  },
};

/**
 * 業種未設定 / マッピング不能時のフォールバック (全業種の平均的な値)。
 */
export const ALL_INDUSTRY_AVERAGE: IndustryBenchmark = {
  operatingProfitMargin: { median: 4.0, q75: 7.0, q90: 12.0 },
  roe: { median: 7.5, q75: 12.0, q90: 18.0 },
  roa: { median: 3.0, q75: 5.5, q90: 9.0 },
  currentRatio: { median: 150, q75: 210, q90: 300 },
  equityRatio: { median: 40, q75: 55, q90: 70 },
  debtEquityRatio: { median: 150, q75: 85, q90: 45 },
  totalAssetTurnover: { median: 1.0, q75: 1.4, q90: 1.8 },
  receivablesTurnover: { median: 8, q75: 12, q90: 17 },
};

export function getIndustryBenchmark(
  industry: IndustryCode | null,
): { benchmark: IndustryBenchmark; matched: boolean } {
  if (!industry) {
    return { benchmark: ALL_INDUSTRY_AVERAGE, matched: false };
  }
  return { benchmark: INDUSTRY_BENCHMARKS[industry], matched: true };
}

/**
 * 各指標の方向 (高いほど良い / 低いほど良い)。
 */
export const INDICATOR_DIRECTION: Record<keyof IndustryBenchmark, 'HIGH' | 'LOW'> = {
  operatingProfitMargin: 'HIGH',
  roe: 'HIGH',
  roa: 'HIGH',
  currentRatio: 'HIGH',
  equityRatio: 'HIGH',
  debtEquityRatio: 'LOW',
  totalAssetTurnover: 'HIGH',
  receivablesTurnover: 'HIGH',
};
