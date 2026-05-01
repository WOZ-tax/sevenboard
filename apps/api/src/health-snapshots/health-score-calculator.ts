/**
 * AI CFO 経営健康スコア計算ロジック。
 *
 * 100 点満点 = 活動性 (40) + 安全性 (40) + 効率性 (20) の構成。
 * 中小企業の標準値・金融機関評価で参照されやすい指標を組み合わせる。
 *
 * スコアリング方針:
 *   - 各指標を個別に 0 〜 配点 でマッピング
 *   - 線形補間で連続スコアを出す (閾値ぴったりで急に変動しないよう)
 *   - 中小企業の現実値を踏まえた控えめな満点ライン (大企業基準ではない)
 */

import type { FinancialIndicators } from '../mf/types/mf-api.types';

export interface HealthScoreBreakdown {
  /** 活動性 (収益性) 0-40 */
  activity: number;
  /** 安全性 0-40 */
  safety: number;
  /** 効率性 0-20 */
  efficiency: number;
  /** 内訳の詳細 (UI レーダーで使う) */
  detail: {
    operatingProfitMargin: number; // 0-15
    roe: number; // 0-15
    roa: number; // 0-10
    currentRatio: number; // 0-15
    equityRatio: number; // 0-15
    debtCoverage: number; // 0-10
    totalAssetTurnover: number; // 0-10
    receivablesTurnover: number; // 0-10
  };
}

export interface HealthScoreResult {
  score: number; // 0-100
  breakdown: HealthScoreBreakdown;
}

export function computeHealthScore(
  indicators: FinancialIndicators,
): HealthScoreResult {
  const detail = {
    operatingProfitMargin: scoreOperatingProfitMargin(
      indicators.operatingProfitMargin,
    ),
    roe: scoreRoe(indicators.roe),
    roa: scoreRoa(indicators.roa),
    currentRatio: scoreCurrentRatio(indicators.currentRatio),
    equityRatio: scoreEquityRatio(indicators.equityRatio),
    debtCoverage: scoreDebtCoverage(indicators.debtEquityRatio),
    totalAssetTurnover: scoreTotalAssetTurnover(indicators.totalAssetTurnover),
    receivablesTurnover: scoreReceivablesTurnover(indicators.receivablesTurnover),
  };

  const activity =
    detail.operatingProfitMargin + detail.roe + detail.roa;
  const safety =
    detail.currentRatio + detail.equityRatio + detail.debtCoverage;
  const efficiency =
    detail.totalAssetTurnover + detail.receivablesTurnover;

  const score = clamp(Math.round(activity + safety + efficiency), 0, 100);

  return {
    score,
    breakdown: {
      activity: Math.round(activity * 10) / 10,
      safety: Math.round(safety * 10) / 10,
      efficiency: Math.round(efficiency * 10) / 10,
      detail,
    },
  };
}

/* ============================================================
 * 個別指標のスコアリング (中小企業の現実値で調整)
 * ============================================================ */

/** 営業利益率 (%): 10% 以上 = 満点、5% = 7.5、0% = 0、マイナス = 0 */
function scoreOperatingProfitMargin(margin: number): number {
  if (margin <= 0) return 0;
  if (margin >= 10) return 15;
  return (margin / 10) * 15;
}

/** ROE (%): 15% 以上 = 満点、5% = 5、0% = 0、マイナス = 0 */
function scoreRoe(roe: number): number {
  if (roe <= 0) return 0;
  if (roe >= 15) return 15;
  return (roe / 15) * 15;
}

/** ROA (%): 5% 以上 = 満点、2% = 4、0% = 0、マイナス = 0 */
function scoreRoa(roa: number): number {
  if (roa <= 0) return 0;
  if (roa >= 5) return 10;
  return (roa / 5) * 10;
}

/** 流動比率 (%): 200% 以上 = 満点、100% = 7.5、50% 以下 = 0 */
function scoreCurrentRatio(ratio: number): number {
  if (ratio <= 50) return 0;
  if (ratio >= 200) return 15;
  if (ratio >= 100) return 7.5 + ((ratio - 100) / 100) * 7.5;
  return ((ratio - 50) / 50) * 7.5;
}

/** 自己資本比率 (%): 50% 以上 = 満点、20% = 6、0% 以下 = 0 */
function scoreEquityRatio(ratio: number): number {
  if (ratio <= 0) return 0;
  if (ratio >= 50) return 15;
  if (ratio >= 20) return 6 + ((ratio - 20) / 30) * 9;
  return (ratio / 20) * 6;
}

/**
 * 負債比率 (%) からの債務カバー指標。低いほど良いので逆スコア。
 *   100% (負債=純資産) 以下 = 満点 10
 *   200% = 5
 *   500% 以上 = 0
 *   純資産がマイナス (debtEquityRatio = 0 で表現) = 0
 */
function scoreDebtCoverage(debtEquityRatio: number): number {
  if (debtEquityRatio <= 0) return 0; // 0 は計算不能 (純資産 0 or マイナス) ケース
  if (debtEquityRatio <= 100) return 10;
  if (debtEquityRatio >= 500) return 0;
  if (debtEquityRatio <= 200) return 10 - ((debtEquityRatio - 100) / 100) * 5;
  return 5 - ((debtEquityRatio - 200) / 300) * 5;
}

/** 総資産回転率 (回): 1.5 以上 = 満点、0.5 = 3.3、0 = 0 */
function scoreTotalAssetTurnover(turnover: number): number {
  if (turnover <= 0) return 0;
  if (turnover >= 1.5) return 10;
  return (turnover / 1.5) * 10;
}

/** 売上債権回転率 (回): 12 以上 (= サイト 1 ヶ月) = 満点、6 = 5、0 = 0 */
function scoreReceivablesTurnover(turnover: number): number {
  if (turnover <= 0) return 0;
  if (turnover >= 12) return 10;
  return (turnover / 12) * 10;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
