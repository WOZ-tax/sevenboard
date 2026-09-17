const keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
export type FiscalMonthKey = (typeof keys)[number];

/** Calendar dates come from the fiscal period, never from an assumed April start. */
export function fiscalMonths(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  const months: { key: FiscalMonthKey; label: string; date: string; month: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    if (date > end) break;
    const month = date.getUTCMonth() + 1;
    months.push({ key: keys[month - 1], label: `${month}月`, date: date.toISOString().slice(0, 10), month });
  }
  return months;
}

export function filterFiscalRows<T extends { month: string }>(rows: T[] | undefined, start: string, end: string): T[] {
  return (rows ?? []).filter(row => row.month.slice(0, 10) >= start && row.month.slice(0, 10) <= end);
}
