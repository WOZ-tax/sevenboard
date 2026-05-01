/**
 * AI CFO 経営健康スコア計算ロジック (業種別ベンチマーク + 倒産リスク即時減点)。
 *
 * 100 点満点 = 活動性 (40) + 安全性 (40) + 効率性 (20) の構成。
 *
 * スコアリング方針:
 *   1. 業種別ベンチマーク (中小企業庁データ) を基準にする
 *      median 達成 = 50%、q75 (上位 25%) 達成 = 75%、q90 (上位 10%) 達成 = 90%、超える = 100%
 *   2. 倒産リスク即時減点 (CRD ライク):
 *      - 自己資本比率 ≤ 5%       → 安全性スコア 50% 上限
 *      - 流動比率 < 100%          → 安全性スコア 60% 上限
 *      - 債務超過 (純資産マイナス) → 総合スコア 30 点上限
 *   3. 業種未設定なら全業種平均 (信頼度: 中)
 *
 * 「銀行に持っていける数字」を直接的に表現することを最重要視する。
 */

import type { FinancialIndicators } from '../mf/types/mf-api.types';
import type { IndustryCode } from '../common/industries';
import { normalizeIndustry } from '../common/industries';
import {
  getIndustryBenchmark,
  INDICATOR_DIRECTION,
  type BenchmarkValues,
  type IndustryBenchmark,
} from './industry-benchmarks';

export interface HealthScoreBreakdown {
  /** 活動性 (収益性) 0-40 */
  activity: number;
  /** 安全性 0-40 */
  safety: number;
  /** 効率性 0-20 */
  efficiency: number;
  /** 内訳の詳細 (UI 内訳表示で使う) */
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
  /** 銀行格付けランク (S/A/B/C/D) */
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  /** 倒産リスク即時減点が発動したフラグ */
  insolvencyFlags: string[];
  /** スコア計算の信頼度 (業種設定があるか / 業種ベンチマークと一致したか) */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 業種コード (実際に使われた、未設定なら null) */
  appliedIndustry: IndustryCode | null;
}

export interface HealthScoreResult {
  score: number; // 0-100
  breakdown: HealthScoreBreakdown;
}

/** 各指標のスコア配点 */
const MAX_SCORES = {
  operatingProfitMargin: 15,
  roe: 15,
  roa: 10,
  currentRatio: 15,
  equityRatio: 15,
  debtCoverage: 10,
  totalAssetTurnover: 10,
  receivablesTurnover: 10,
} as const;

export function computeHealthScore(
  indicators: FinancialIndicators,
  industryRaw: string | null,
): HealthScoreResult {
  const industry = normalizeIndustry(industryRaw);
  const { benchmark, matched } = getIndustryBenchmark(industry);

  const detail = {
    operatingProfitMargin: scoreByBenchmark(
      indicators.operatingProfitMargin,
      benchmark.operatingProfitMargin,
      INDICATOR_DIRECTION.operatingProfitMargin,
      MAX_SCORES.operatingProfitMargin,
    ),
    roe: scoreByBenchmark(
      indicators.roe,
      benchmark.roe,
      INDICATOR_DIRECTION.roe,
      MAX_SCORES.roe,
    ),
    roa: scoreByBenchmark(
      indicators.roa,
      benchmark.roa,
      INDICATOR_DIRECTION.roa,
      MAX_SCORES.roa,
    ),
    currentRatio: scoreByBenchmark(
      indicators.currentRatio,
      benchmark.currentRatio,
      INDICATOR_DIRECTION.currentRatio,
      MAX_SCORES.currentRatio,
    ),
    equityRatio: scoreByBenchmark(
      indicators.equityRatio,
      benchmark.equityRatio,
      INDICATOR_DIRECTION.equityRatio,
      MAX_SCORES.equityRatio,
    ),
    debtCoverage: scoreDebtCoverage(
      indicators.debtEquityRatio,
      benchmark.debtEquityRatio,
    ),
    totalAssetTurnover: scoreByBenchmark(
      indicators.totalAssetTurnover,
      benchmark.totalAssetTurnover,
      INDICATOR_DIRECTION.totalAssetTurnover,
      MAX_SCORES.totalAssetTurnover,
    ),
    receivablesTurnover: scoreByBenchmark(
      indicators.receivablesTurnover,
      benchmark.receivablesTurnover,
      INDICATOR_DIRECTION.receivablesTurnover,
      MAX_SCORES.receivablesTurnover,
    ),
  };

  let activity =
    detail.operatingProfitMargin + detail.roe + detail.roa;
  let safety =
    detail.currentRatio + detail.equityRatio + detail.debtCoverage;
  let efficiency =
    detail.totalAssetTurnover + detail.receivablesTurnover;

  // CRD ライクな倒産リスク即時減点
  const insolvencyFlags: string[] = [];

  // 自己資本比率 ≤ 5% → 安全性 50% 上限
  if (indicators.equityRatio <= 5) {
    safety = Math.min(safety, 40 * 0.5);
    insolvencyFlags.push('low_equity_ratio');
  }
  // 流動比率 < 100% → 安全性 60% 上限
  if (indicators.currentRatio < 100) {
    safety = Math.min(safety, 40 * 0.6);
    insolvencyFlags.push('low_current_ratio');
  }

  // 仮スコア
  let score = activity + safety + efficiency;

  // 債務超過 (debtEquityRatio === 0 が schema 上「純資産 0 以下」を表す。
  // ただ純資産マイナスの完全判定は indicators だけからは厳密にできない。
  // 実用上は equityRatio < 0 で判定)。
  if (indicators.equityRatio < 0) {
    score = Math.min(score, 30);
    insolvencyFlags.push('insolvent');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // ランク判定 (5 段階)
  const rank: HealthScoreBreakdown['rank'] =
    score >= 85
      ? 'S'
      : score >= 70
        ? 'A'
        : score >= 55
          ? 'B'
          : score >= 40
            ? 'C'
            : 'D';

  // 信頼度
  const confidence: HealthScoreBreakdown['confidence'] = matched
    ? 'HIGH'
    : industry === null
      ? 'MEDIUM'
      : 'LOW';

  return {
    score,
    breakdown: {
      activity: Math.round(activity * 10) / 10,
      safety: Math.round(safety * 10) / 10,
      efficiency: Math.round(efficiency * 10) / 10,
      detail,
      rank,
      insolvencyFlags,
      confidence,
      appliedIndustry: industry,
    },
  };
}

/**
 * ベンチマーク (median / q75 / q90) を使った段階的スコアリング。
 *
 * direction='HIGH' の指標 (大きいほど良い):
 *   value ≤ 0          → 0
 *   value < median     → 0 〜 50%  (線形)
 *   median ≤ v < q75   → 50 〜 75% (線形)
 *   q75 ≤ v < q90      → 75 〜 90% (線形)
 *   q90 ≤ v            → 90 〜 100% (q90 + 50% で 100)
 *
 * direction='LOW' は同じロジックを「小さいほど良い」で適用 (debtCoverage で個別実装)
 */
function scoreByBenchmark(
  value: number,
  benchmark: BenchmarkValues,
  direction: 'HIGH' | 'LOW',
  maxScore: number,
): number {
  if (direction === 'LOW') {
    return scoreLowerIsBetter(value, benchmark, maxScore);
  }

  if (value <= 0) return 0;
  if (value >= benchmark.q90) {
    // q90 + 50% で 100% に到達
    const beyond = (value - benchmark.q90) / Math.max(benchmark.q90 * 0.5, 1);
    return Math.min(maxScore, maxScore * (0.9 + 0.1 * beyond));
  }
  if (value >= benchmark.q75) {
    return (
      maxScore * (0.75 + ((value - benchmark.q75) / (benchmark.q90 - benchmark.q75)) * 0.15)
    );
  }
  if (value >= benchmark.median) {
    return (
      maxScore *
      (0.5 + ((value - benchmark.median) / (benchmark.q75 - benchmark.median)) * 0.25)
    );
  }
  // 0 〜 median を線形
  return maxScore * 0.5 * (value / benchmark.median);
}

/**
 * 「低いほど良い」指標のスコアリング (負債比率など)。
 *   value ≥ median * 2  → 0
 *   q75 < v ≤ median    → 25 〜 50%
 *   q90 < v ≤ q75       → 50 〜 75% (median と q75 の間とは逆 → 並びは median > q75 > q90)
 *   q90 ≥ v             → 90 〜 100%
 */
function scoreLowerIsBetter(
  value: number,
  benchmark: BenchmarkValues,
  maxScore: number,
): number {
  // benchmark の並びは median > q75 > q90 (小さいほど良い)
  const { median, q75, q90 } = benchmark;
  if (value <= q90) return maxScore; // 上位 10%
  if (value <= q75) {
    // q90 〜 q75 の間
    return maxScore * (0.75 + ((q75 - value) / (q75 - q90)) * 0.15);
  }
  if (value <= median) {
    return maxScore * (0.5 + ((median - value) / (median - q75)) * 0.25);
  }
  if (value <= median * 2) {
    return maxScore * 0.5 * ((median * 2 - value) / median);
  }
  return 0;
}

/**
 * 債務カバー指標。debtEquityRatio (負債/純資産 %) を使う。
 *  - 純資産 0 以下 (debtEquityRatio = 0 のレコード) → 0 点
 *  - それ以外は scoreLowerIsBetter
 */
function scoreDebtCoverage(
  debtEquityRatio: number,
  benchmark: BenchmarkValues,
): number {
  if (debtEquityRatio <= 0) return 0; // 計算不能 (純資産マイナス or ゼロ)
  return scoreLowerIsBetter(debtEquityRatio, benchmark, MAX_SCORES.debtCoverage);
}
