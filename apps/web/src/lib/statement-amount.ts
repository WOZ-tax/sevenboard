import type { FinancialStatementRow } from './mf-types';

/** Presentation headers carry zero; only actual rows can supply a balance. */
export function statementAmount(rows: FinancialStatementRow[] | undefined, key: string): number | null {
  const values = (rows ?? []).filter(row => !row.isHeader && Number.isFinite(row.current));
  const row = values.find(row => row.category.trim() === `${key}合計`)
    ?? values.find(row => row.category.trim() === key)
    ?? values.find(row => row.category.includes(key));
  return row?.current ?? null;
}
