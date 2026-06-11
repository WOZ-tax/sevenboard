/**
 * 会計期間の年表現は「期末年(end year)」に統一する。
 *
 * MF の `fiscal_year` および本システムの `fiscalYear` は、その会計期間が終了する
 * カレンダー年を指す(例: 2025年4月〜2026年3月の3月決算 → fiscalYear=2026)。
 *
 * 月(カレンダー月 1-12)を、その会計期間内での実カレンダー年に変換する。
 * sync / journal-review / health-snapshots はすべてこの関数を経由し、
 * モジュール間で変換規約がズレないようにする。
 *
 * @param fiscalYear   期末年(end year)
 * @param month        カレンダー月 (1-12)
 * @param fyStartMonth 期首月 (1-12)。3月決算なら4、12月決算なら1。
 */
export function fiscalMonthToCalendarYear(
  fiscalYear: number,
  month: number,
  fyStartMonth: number,
): number {
  // 12月決算(期首1月)は会計期間=暦年なので、全月が期末年と一致。
  if (fyStartMonth === 1) return fiscalYear;
  // 期首月以降(年内前半)は前年、期首月より前(年明け)は期末年。
  return month >= fyStartMonth ? fiscalYear - 1 : fiscalYear;
}

/** 決算月(fiscalMonthEnd, 1-12)から期首月を求める。 */
export function fyStartMonthFromFiscalMonthEnd(fiscalMonthEnd: number): number {
  return fiscalMonthEnd === 12 ? 1 : fiscalMonthEnd + 1;
}

/** 期末年 + カレンダー月 + 期首月 から、その月初(UTC)の Date を返す。 */
export function fiscalMonthToDate(
  fiscalYear: number,
  month: number,
  fyStartMonth: number,
): Date {
  const year = fiscalMonthToCalendarYear(fiscalYear, month, fyStartMonth);
  return new Date(Date.UTC(year, month - 1, 1));
}
