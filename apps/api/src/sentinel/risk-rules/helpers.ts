/**
 * リスク検知ルールの共通ヘルパー。
 *
 * 各ルールが個別に金額判定や正規化ロジックを書くと検知レベルがバラつくため、
 * ここに集約して一貫した重み付けを保証する。
 */

/**
 * 金額の重要性係数を返す (CFO 原則 4: 数字を経営判断に翻訳する)。
 *
 * 「金額が小さい異常は無視できるようにする」ための補正:
 *   abs(amount) < 100,000           → 0.5  (些少、表示優先度を下げる)
 *   100,000 - 1,000,000             → 1.0  (標準)
 *   1,000,000 以上 かつ 月商 5% 未満 → 1.15
 *   月商 5% 以上                     → 1.3  (経営インパクト大)
 *
 * monthlyRevenue が未提供なら金額レンジだけで判定する。
 */
export function materialMultiplier(
  amount: number,
  monthlyRevenue?: number,
): number {
  const abs = Math.abs(amount);
  if (abs < 100_000) return 0.5;
  if (monthlyRevenue && monthlyRevenue > 0 && abs >= monthlyRevenue * 0.05) {
    return 1.3;
  }
  if (abs >= 1_000_000) return 1.15;
  return 1.0;
}

/**
 * base_score × material_multiplier で実効スコアを計算。0-100 にクランプ。
 */
export function computeRiskScore(
  baseScore: number,
  amount: number,
  monthlyRevenue?: number,
): number {
  const mult = materialMultiplier(amount, monthlyRevenue);
  const score = Math.round(baseScore * mult);
  return Math.max(0, Math.min(100, score));
}

/**
 * 円表記の整形 (¥1,234,567)。
 * UI 側との表記揺れを避けるため、ルール内のテキスト生成でこれを使う。
 */
export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`;
}

/**
 * 期間ラベル ("2026年4月" 等)
 */
export function formatPeriod(fiscalYear: number, month: number): string {
  return `${fiscalYear}年${month}月`;
}
