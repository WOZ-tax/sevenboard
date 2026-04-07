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
import { formatManYen } from "@/lib/format";

export type CertaintyLevel = "confirmed" | "planned" | "estimated";

const defaultCertainty: Record<string, CertaintyLevel> = {
  "売上回収": "confirmed",
  "売上入金": "confirmed",
  "人件費": "planned",
  "家賃": "planned",
  "借入返済": "planned",
  "その他経費": "estimated",
  "その他支出": "estimated",
  "設備投資": "estimated",
  "法人税等": "estimated",
};

const certaintyOpacity: Record<CertaintyLevel, string> = {
  confirmed: "opacity-100",
  planned: "opacity-70",
  estimated: "opacity-40",
};

const certaintyLegend: { level: CertaintyLevel; label: string; color: string }[] = [
  { level: "confirmed", label: "確定", color: "bg-blue-500" },
  { level: "planned", label: "予定", color: "bg-amber-500" },
  { level: "estimated", label: "概算", color: "bg-gray-400" },
];

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
}

export function CashflowTable({
  months: propMonths,
  rows: propRows,
  certaintyLevels,
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
    return defaultCertainty[trimmed];
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center gap-4">
        {certaintyLegend.map(({ level, label, color }) => (
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
            {months.map((month) => (
              <TableHead
                key={month}
                className="w-28 text-right font-semibold text-[var(--color-text-primary)]"
              >
                {month}
              </TableHead>
            ))}
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
                      certainty && !row.isHeader && !row.isTotal && !row.isDiff && certaintyOpacity[certainty]
                    )}
                  >
                    {value !== null ? formatManYen(value) : ""}
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
