/**
 * 統計ルール (L2) 用のヘルパー。
 *
 * 過去 N ヶ月の数値配列から中央値・四分位範囲 (IQR) を計算し、
 * 当月値が逸脱しているかを判定する。
 *
 * IQR ベースを採用する理由:
 *   - 平均±2σ は外れ値に引っ張られる (1 ヶ月だけ突発的に大きい支出があると
 *     基準値が膨らんで翌月以降の検知が緩くなる)
 *   - IQR は中央値ベースなので外れ値の影響を受けにくい
 */

export interface IqrSummary {
  count: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  lowerFence: number; // Q1 - 1.5 * IQR
  upperFence: number; // Q3 + 1.5 * IQR
}

/**
 * 値配列から四分位境界を計算。
 * count < 4 の場合は IQR を使った判定が無意味なので caller 側で skip する。
 */
export function computeIqr(values: number[]): IqrSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return {
    count: n,
    median,
    q1,
    q3,
    iqr,
    lowerFence: q1 - 1.5 * iqr,
    upperFence: q3 + 1.5 * iqr,
  };
}

/**
 * 線形補間ベースの分位数 (R type 7、numpy.percentile デフォルトと同じ)。
 */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * 当月値の逸脱度合いをスコア化する。
 *
 *   |z| < 1.5 IQR  → null (検知なし)
 *   1.5 〜 2.5 IQR → 50 〜 75
 *   2.5 〜 4 IQR   → 75 〜 90
 *   > 4 IQR        → 90+
 *
 * fence の外側にあれば必ず非 null を返す。
 */
export function scoreDeviation(
  value: number,
  summary: IqrSummary,
): { score: number; direction: 'high' | 'low'; sigma: number } | null {
  if (summary.iqr === 0) return null; // 分散がない (全月同じ) なら判定不可
  if (value > summary.upperFence) {
    const sigma = (value - summary.q3) / summary.iqr;
    return { score: clampScoreFromSigma(sigma), direction: 'high', sigma };
  }
  if (value < summary.lowerFence) {
    const sigma = (summary.q1 - value) / summary.iqr;
    return { score: clampScoreFromSigma(sigma), direction: 'low', sigma };
  }
  return null;
}

function clampScoreFromSigma(sigma: number): number {
  // sigma >= 1.5 (fence 到達点) で 50 スタート
  if (sigma < 1.5) return 50;
  if (sigma < 2.5) return Math.round(50 + (sigma - 1.5) * 25);
  if (sigma < 4) return Math.round(75 + (sigma - 2.5) * 10);
  return Math.min(95, Math.round(90 + (sigma - 4) * 2));
}
