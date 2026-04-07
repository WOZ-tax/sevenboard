/**
 * 金額を万円単位でフォーマット
 * e.g., 12500000 → "¥1,250万"
 * e.g., -3200000 → "-¥320万"
 */
export function formatManYen(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const manYen = Math.round(absAmount / 10000);
  const formatted = manYen.toLocaleString('ja-JP');
  return `${isNegative ? '-' : ''}¥${formatted}万`;
}

/**
 * 金額を円単位でフォーマット
 * e.g., 12500000 → "¥12,500,000"
 */
export function formatYen(amount: number): string {
  const isNegative = amount < 0;
  const formatted = Math.abs(Math.round(amount)).toLocaleString('ja-JP');
  return `${isNegative ? '-' : ''}¥${formatted}`;
}

/**
 * パーセンテージをフォーマット
 * e.g., 8.234 → "+8.2%"
 * e.g., -3.5 → "-3.5%"
 */
export function formatPercent(value: number, decimals: number = 1): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * ランウェイ月数をフォーマット
 * e.g., 8.3 → "8.3ヶ月"
 */
export function formatRunway(months: number): string {
  return `${months.toFixed(1)}ヶ月`;
}

/**
 * 月次ラベル生成
 * e.g., "2026-04" → "4月"
 */
export function formatMonthLabel(monthStr: string): string {
  const month = parseInt(monthStr.split('-')[1], 10);
  return `${month}月`;
}

/**
 * アラートレベルの日本語ラベル
 */
export function getAlertLabel(level: string): { label: string; color: string } {
  switch (level) {
    case 'SAFE':
      return { label: '安全', color: 'green' };
    case 'CAUTION':
      return { label: '注意', color: 'yellow' };
    case 'WARNING':
      return { label: '警告', color: 'orange' };
    case 'CRITICAL':
      return { label: '危険', color: 'red' };
    default:
      return { label: '不明', color: 'gray' };
  }
}
