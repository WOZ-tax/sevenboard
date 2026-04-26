"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatYen } from "@/lib/format";
import {
  CERTAINTY_LEGEND,
  CERTAINTY_OPACITY,
  DEFAULT_CERTAINTY_RULES,
  type CertaintyLevel,
} from "@/lib/cashflow-certainty";

export type { CertaintyLevel };

interface CashflowRow {
  category: string;
  values: (number | null)[];
  isTotal?: boolean;
  isHeader?: boolean;
  isDiff?: boolean;
}

interface CashflowTableProps {
  months?: string[];
  rows?: CashflowRow[];
  certaintyLevels?: Record<string, CertaintyLevel>;
  /** 対象期間外の月列をグレーアウトしたい場合に渡す。戻り値trueなら範囲内 */
  isMonthInRange?: (month: number) => boolean;
}

function parseMonthNumber(label: string): number | null {
  const jp = label.match(/(\d{1,2})月/);
  if (jp) return Number(jp[1]);
  const iso = label.match(/-(\d{1,2})(?:[-/]|$)/);
  if (iso) return Number(iso[1]);
  return null;
}

export function CashflowTable({
  months: propMonths,
  rows: propRows,
  certaintyLevels,
  isMonthInRange,
}: CashflowTableProps = {}) {
  if (!propMonths || !propRows || propRows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        MFクラウド会計を接続すると資金繰り表が表示されます
      </div>
    );
  }
  const months = propMonths;
  const rows = propRows;

  const getCertainty = (category: string): CertaintyLevel | undefined => {
    const trimmed = category.trim();
    if (certaintyLevels?.[trimmed]) return certaintyLevels[trimmed];
    return DEFAULT_CERTAINTY_RULES[trimmed];
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center gap-4">
        {CERTAINTY_LEGEND.map(({ level, label, color }) => (
          <span key={level} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", color)} />
            {label}
          </span>
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
            <TableHead className="w-40 font-semibold text-[var(--color-text-primary)]">
              勘定科目
            </TableHead>
            {months.map((month) => {
              const mNum = parseMonthNumber(month);
              const outOfRange =
                isMonthInRange && mNum !== null ? !isMonthInRange(mNum) : false;
              return (
                <TableHead
                  key={month}
                  className={cn(
                    "w-28 text-right font-semibold text-[var(--color-text-primary)]",
                    outOfRange && "bg-muted/30 text-muted-foreground/60",
                  )}
                >
                  {month}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={index}
              className={cn(
                row.isHeader && "bg-muted/50",
                row.isTotal && !row.isDiff && "bg-muted/30 font-semibold",
                row.isDiff && "bg-[var(--color-tertiary)]/10 font-bold"
              )}
            >
              <TableCell
                className={cn(
                  "text-sm",
                  row.isHeader
                    ? "font-bold text-[var(--color-text-primary)]"
                    : row.isTotal
                      ? "font-semibold"
                      : "text-muted-foreground"
                )}
              >
                {row.category}
              </TableCell>
              {row.values.map((value, i) => {
                const certainty = getCertainty(row.category);
                const mNum = parseMonthNumber(months[i] ?? "");
                const outOfRange =
                  isMonthInRange && mNum !== null ? !isMonthInRange(mNum) : false;
                return (
                  <TableCell
                    key={i}
                    className={cn(
                      "text-right font-[family-name:var(--font-inter)] text-sm tabular-nums",
                      value !== null && value < 0 && "text-[var(--color-negative)]",
                      row.isDiff &&
                        value !== null &&
                        value > 0 &&
                        "text-[var(--color-positive)]",
                      certainty && !row.isHeader && !row.isTotal && !row.isDiff && CERTAINTY_OPACITY[certainty],
                      outOfRange && "bg-muted/20 text-muted-foreground/50",
                    )}
                  >
                    {value !== null ? formatYen(value) : ""}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
