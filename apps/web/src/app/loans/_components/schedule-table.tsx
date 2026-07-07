"use client";

import { Fragment, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LoanScheduleRow } from "@/lib/api-types";
import { pct, yen } from "../_lib/loan-format";

function yearOf(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const m = /^(\d{4})-/.exec(dueDate);
  return m ? m[1] : null;
}

/** 読み取り専用の償還スケジュール表。年区切りの見出し行を挟む。 */
export function ScheduleTable({ rows }: { rows: LoanScheduleRow[] }) {
  // 年区切り見出しの表示判定。変数再代入を避けるため直前行との比較で求める。
  const prepared = useMemo(() => {
    const sorted = [...(rows ?? [])].sort((a, b) => a.seq - b.seq);
    return sorted.map((row, idx) => {
      const year = yearOf(row.dueDate);
      const prevYear = idx > 0 ? yearOf(sorted[idx - 1].dueDate) : null;
      const showYearHeader = year != null && year !== prevYear;
      return { row, year, showYearHeader };
    });
  }, [rows]);

  if (!rows || rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        償還スケジュールが登録されていません。
      </div>
    );
  }

  return (
    <div className="max-h-[540px] overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-[var(--color-background)]">
          <TableRow className="border-b-2 border-[var(--color-border)]">
            <TableHead className="text-right">回数</TableHead>
            <TableHead>約定日</TableHead>
            <TableHead className="text-right">元金</TableHead>
            <TableHead className="text-right">利息</TableHead>
            <TableHead className="text-right">元利合計</TableHead>
            <TableHead className="text-right">残高</TableHead>
            <TableHead className="text-right">利率</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {prepared.map(({ row, year, showYearHeader }) => {
            return (
              <Fragment key={`${row.seq}-${row.dueDate}`}>
                {showYearHeader && (
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell
                      colSpan={8}
                      className="py-1.5 text-xs font-semibold text-muted-foreground"
                    >
                      {year}年
                    </TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.seq}
                  </TableCell>
                  <TableCell className="text-sm">{row.dueDate || "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {yen(row.principalAmount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {yen(row.interestAmount)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">
                    {yen(row.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {yen(row.balanceAfter)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.interestRate == null ? "—" : pct(row.interestRate)}
                  </TableCell>
                  <TableCell>
                    {row.isEstimated && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-[10px] text-amber-700"
                      >
                        見直し待ち
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
