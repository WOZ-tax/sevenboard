/**
 * MF BS 推移表 (MfTransition) から「対象月」と「前月」の closing 残高を取り出すヘルパー。
 *
 * MF 推移表の columns は会計年度始まり月から並ぶ。
 *   例: 期首 4 月 → columns = ["4","5",...,"3","settlement_balance","total"]
 *   例: 期首 1 月 → columns = ["1","2",...,"12","settlement_balance","total"]
 * 数字以外の列 (settlement_balance, total) は除外して 12 ヶ月の配列を作る。
 */

import type { MfReportRow, MfTransition } from '../../mf/types/mf-api.types';

/**
 * 推移表の columns から、index → カレンダー月 (1-12) の対応配列を作る。
 */
export function buildCalendarMonths(transition: MfTransition): number[] {
  return transition.columns
    .filter((c) => /^\d+$/.test(c))
    .map((c) => parseInt(c, 10));
}

/**
 * 行の values 配列から、指定カレンダー月 (1-12) の値を取り出す。
 * 該当月がなければ null。
 */
export function valueAtMonth(
  row: MfReportRow,
  transition: MfTransition,
  calendarMonth: number,
): number | null {
  const months = buildCalendarMonths(transition);
  const idx = months.indexOf(calendarMonth);
  if (idx === -1) return null;
  const v = row.values?.[idx];
  return typeof v === 'number' ? v : null;
}

/**
 * 対象月の前月のカレンダー月を返す (1 月の前月は 12 月)。
 */
export function prevCalendarMonth(month: number): number {
  return month === 1 ? 12 : month - 1;
}

/**
 * 対象月と前月の closing 残高を取得。
 * 推移表に当該月がなければ null を返す。
 */
export function getCurrentAndPrevBalance(
  row: MfReportRow,
  transition: MfTransition,
  month: number,
): { current: number | null; prev: number | null } {
  return {
    current: valueAtMonth(row, transition, month),
    prev: valueAtMonth(row, transition, prevCalendarMonth(month)),
  };
}

/**
 * 過去 N ヶ月の月次値を新→古の順で返す (対象月含む)。
 * 推移表内に存在する月のみを返すため、配列長は最大 N。
 */
export function recentMonthlyValues(
  row: MfReportRow,
  transition: MfTransition,
  fromMonth: number,
  count: number,
): { month: number; value: number }[] {
  const months = buildCalendarMonths(transition);
  const result: { month: number; value: number }[] = [];
  let cursor = fromMonth;
  for (let i = 0; i < count; i++) {
    const idx = months.indexOf(cursor);
    if (idx !== -1) {
      const v = row.values?.[idx];
      if (typeof v === 'number') {
        result.push({ month: cursor, value: v });
      }
    }
    cursor = prevCalendarMonth(cursor);
  }
  return result;
}
