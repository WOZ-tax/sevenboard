"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatYen, formatPercent, getValueColor } from "@/lib/format";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import {
  useBudgetContext,
  useNormalizedVarianceRows,
} from "@/hooks/use-business-data";

const months = [
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
  "1月",
  "2月",
  "3月",
];

const departments = ["全社", "営業部", "管理部", "開発チーム"];

export default function VariancePage() {
  const { activeFiscalYear, varianceQuery } = useBudgetContext();
  const apiRows = useNormalizedVarianceRows(varianceQuery.data);
  const [selectedMonth, setSelectedMonth] = useState("3月");
  const [selectedDept, setSelectedDept] = useState("全社");
  const [viewMode, setViewMode] = useState<"monthly" | "cumulative">("monthly");

  const rows = apiRows;

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            予実差異
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeFiscalYear
              ? `${activeFiscalYear.year}年度 予算実績比較`
              : "予算実績比較"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-md border border-input">
            <Button
              variant={viewMode === "monthly" ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-9 rounded-none text-xs",
                viewMode === "monthly" && "bg-[var(--color-primary)] text-white"
              )}
              onClick={() => setViewMode("monthly")}
            >
              単月
            </Button>
            <Button
              variant={viewMode === "cumulative" ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-9 rounded-none text-xs",
                viewMode === "cumulative" && "bg-[var(--color-primary)] text-white"
              )}
              onClick={() => setViewMode("cumulative")}
            >
              累計
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              予実差異表
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <MfEmptyState title="予実データがありません" description="予算を設定しMFクラウド会計を接続すると、予実差異が表示されます。" />
            ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
                    <TableHead className="w-48 font-semibold text-[var(--color-text-primary)]">
                      勘定科目
                    </TableHead>
                    <TableHead className="w-28 text-right font-semibold text-[var(--color-text-primary)]">
                      予算
                    </TableHead>
                    <TableHead className="w-28 text-right font-semibold text-[var(--color-text-primary)]">
                      実績
                    </TableHead>
                    <TableHead className="w-28 text-right font-semibold text-[var(--color-text-primary)]">
                      差異
                    </TableHead>
                    <TableHead className="w-28 text-right font-semibold text-[var(--color-text-primary)]">
                      差異率
                    </TableHead>
                    <TableHead className="w-28 text-right font-semibold text-[var(--color-text-primary)]">
                      前年同月
                    </TableHead>
                    <TableHead className="w-28 text-right font-semibold text-[var(--color-text-primary)]">
                      前年同月比
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const isSubItem = row.category.startsWith("  ");
                    const totalCategories = ["売上総利益", "営業利益", "経常利益"];
                    const isTotalRow = totalCategories.includes(row.category.trim());
                    const absRatio = Math.abs(row.ratio);

                    // Conditional row background (skip totals)
                    const rowBg = isTotalRow
                      ? "bg-muted/50 font-semibold"
                      : absRatio > 20
                        ? "bg-[#fce4ec]"
                        : absRatio >= 10
                          ? "bg-[#fff8e1]"
                          : "";

                    // Conditional ratio text color (skip totals)
                    const ratioColor = isTotalRow
                      ? getValueColor(row.ratio)
                      : absRatio > 20
                        ? "text-[var(--color-error)] font-bold"
                        : absRatio >= 10
                          ? "text-[#8d6e00] font-semibold"
                          : getValueColor(row.ratio);

                    return (
                      <TableRow key={index} className={rowBg}>
                        <TableCell
                          className={cn(
                            "text-sm",
                            isSubItem && "text-muted-foreground",
                            isTotalRow && "font-bold text-[var(--color-text-primary)]"
                          )}
                        >
                          {isTotalRow ? (
                            row.category
                          ) : (
                            <Link
                              href={`/drilldown?account=${encodeURIComponent(row.category.trim())}`}
                              className="hover:text-[var(--color-primary)] hover:underline"
                            >
                              {row.category}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-[family-name:var(--font-inter)] text-sm tabular-nums">
                          {formatYen(row.budget)}
                        </TableCell>
                        <TableCell className="text-right font-[family-name:var(--font-inter)] text-sm tabular-nums">
                          {formatYen(row.actual)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-[family-name:var(--font-inter)] text-sm tabular-nums",
                            getValueColor(row.variance)
                          )}
                        >
                          {row.variance > 0 ? "+" : ""}
                          {formatYen(row.variance)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-[family-name:var(--font-inter)] text-sm tabular-nums",
                            ratioColor
                          )}
                        >
                          {formatPercent(row.ratio)}
                        </TableCell>
                        <TableCell className="text-right font-[family-name:var(--font-inter)] text-sm tabular-nums">
                          {row.priorYear != null ? formatYen(row.priorYear) : "—"}
                        </TableCell>
                        {(() => {
                          const pyRatio =
                            row.priorYear != null && row.priorYear !== 0
                              ? ((row.actual - row.priorYear) / row.priorYear) * 100
                              : null;
                          return (
                            <TableCell
                              className={cn(
                                "text-right font-[family-name:var(--font-inter)] text-sm tabular-nums",
                                pyRatio != null && pyRatio > 0
                                  ? "text-[var(--color-positive)]"
                                  : pyRatio != null && pyRatio < 0
                                    ? "text-[var(--color-negative)]"
                                    : "text-muted-foreground"
                              )}
                            >
                              {pyRatio != null ? formatPercent(pyRatio) : "—"}
                            </TableCell>
                          );
                        })()}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
