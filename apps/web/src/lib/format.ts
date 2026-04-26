// TODO: @sevenboard/shared/utils/format に統合する

/**
 * 金額を万円表記でフォーマットする
 * 例: 12500 -> "¥12,500万"
 */
export function formatManYen(value: number): string {
  return `¥${value.toLocaleString()}万`;
}

/**
 * 金額を円表記でフォーマットする（API返却の生の円値をそのまま表示）
 * 例: 960000000 -> "¥960,000,000"
 */
export function formatYen(value: number): string {
  return `¥${value.toLocaleString()}`;
}

/**
 * パーセントを表示用にフォーマットする
 * 例: 5.2 -> "+5.2%"
 */
export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * 数値の増減に応じた文字色を返す
 */
export function getValueColor(value: number): string {
  if (value > 0) return "text-[var(--color-positive)]";
  if (value < 0) return "text-[var(--color-negative)]";
  return "text-muted-foreground";
}
