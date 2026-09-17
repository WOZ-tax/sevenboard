"use client";

import { Suspense, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronRight, Search, ArrowLeft, Download } from "lucide-react";
import { useMfAccountTransition, useMfJournals } from "@/hooks/use-mf-data";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { usePeriodStore } from "@/lib/period-store";
import { fiscalMonths } from "@/lib/fiscal-months";
import { journalDisplayRows } from "@/lib/journal-display";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function formatYen(value: number): string {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })}万`;
  }
  return value.toLocaleString();
}

interface JournalRow {
  id: string;
  date: string;
  debit: string;
  credit: string;
  amount: number;
  description: string;
}

export default function DrilldownPage() {
  return (
    <Suspense fallback={<DashboardShell><div className="py-8 text-center text-muted-foreground">読み込み中...</div></DashboardShell>}>
      <DrilldownContent />
    </Suspense>
  );
}

function DrilldownContent() {
  const searchParams = useSearchParams();
  const accountName = searchParams.get("account") || "";
  const monthParam = searchParams.get("month") || "";
  const { fiscalYear, periods } = usePeriodStore();
  const period = periods.find((p) => p.fiscal_year === fiscalYear) ?? periods[0];

  const [selectedMonth, setSelectedMonth] = useState<string | null>(
    monthParam ? `${monthParam}月` : null
  );

  const transition = useMfAccountTransition(accountName);

  // 仕訳クエリ用のdate range計算
  const journalParams = useMemo(() => {
    if (!period || !accountName) return undefined;
    if (!selectedMonth) return { startDate: period.start_date, endDate: period.end_date, accountName };
    const m = fiscalMonths(period.start_date, period.end_date).find(m => m.label === selectedMonth);
    if (!m) return undefined;
    const startDate = m.date;
    const endDate = new Date(Date.UTC(Number(m.date.slice(0, 4)), m.month, 0)).toISOString().slice(0, 10);
    return { startDate, endDate, accountName };
  }, [selectedMonth, accountName, period]);

  const journals = useMfJournals(journalParams);

  const transitionData = useMemo(
    () => transition.data ?? [],
    [transition.data],
  );
  const hasTransitionData = transitionData.length > 0;

  const journalList = useMemo(() => {
    if (!journals.data?.journals?.length) return [];
    return journalDisplayRows(journals.data.journals, accountName);
  }, [journals.data, accountName]);

  // --- フィルタ state ---
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  // cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const filteredJournals = useMemo(() => {
    let list = journalList;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (j) =>
          (j.description && j.description.toLowerCase().includes(q)) ||
          (j.debit && j.debit.toLowerCase().includes(q)) ||
          (j.credit && j.credit.toLowerCase().includes(q))
      );
    }
    const min = amountMin !== "" ? Number(amountMin) : null;
    const max = amountMax !== "" ? Number(amountMax) : null;
    if (min !== null && !isNaN(min)) {
      list = list.filter((j) => j.amount >= min);
    }
    if (max !== null && !isNaN(max)) {
      list = list.filter((j) => j.amount <= max);
    }
    return list;
  }, [journalList, debouncedSearch, amountMin, amountMax]);

  const csvEscape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const exportCsv = useCallback(() => {
    const bom = "\uFEFF";
    const header = "日付,科目,金額,摘要\n";
    const rows = filteredJournals
      .map(
        (r) =>
          `${csvEscape(r.date || "")},${csvEscape(r.debit || r.credit || "")},${r.amount},${csvEscape(r.description || "")}`
      )
      .join("\n");
    const blob = new Blob([bom + header + rows], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `仕訳一覧_${accountName || "科目"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredJournals, accountName]);

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* パンくず */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-[var(--color-primary)] transition-colors">
            ダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className={cn(!selectedMonth && "font-semibold text-[var(--color-text-primary)]")}>
            {accountName || "科目詳細"}
          </span>
          {selectedMonth && (
            <>
              <ChevronRight className="h-4 w-4" />
              <span className="font-semibold text-[var(--color-text-primary)]">
                {selectedMonth}
              </span>
            </>
          )}
        </nav>

        {/* ヘッダー */}
        <div className="flex items-center gap-3">
          <Search className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              {accountName || "科目詳細"}
            </h1>
            <p className="text-sm text-muted-foreground">
              科目別月次推移と仕訳明細
            </p>
          </div>
        </div>

        {/* L2: 月次推移 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[var(--color-text-primary)]">
              月次推移
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasTransitionData ? (
              <MfEmptyState
                title="月次推移データがありません"
                description="MFクラウド会計を接続すると、科目別の月次推移が表示されます。"
              />
            ) : (
            <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={transitionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis
                    fontSize={12}
                    tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`}
                  />
                  <Tooltip
                    formatter={(value) => [`¥${Number(value).toLocaleString()}`, "金額"]}
                  />
                  <Bar
                    dataKey="amount"
                    fill="var(--color-primary)"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(data) => {
                      const payload = data as { month?: string } | undefined;
                      if (payload?.month) setSelectedMonth(payload.month);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>月</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead className="text-right">前月比</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transitionData.map((item, i) => {
                  const prev = i > 0 ? transitionData[i - 1].amount : 0;
                  const diff = prev ? ((item.amount - prev) / prev) * 100 : 0;
                  const isSelected = selectedMonth === item.month;
                  return (
                    <TableRow
                      key={item.month}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        isSelected && "bg-[var(--color-tertiary)]/10"
                      )}
                      onClick={() => setSelectedMonth(item.month)}
                    >
                      <TableCell className="font-medium">{item.month}</TableCell>
                      <TableCell className="text-right">
                        ¥{formatYen(item.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {prev > 0 && (
                          <span
                            className={cn(
                              diff > 0
                                ? "text-[var(--color-positive)]"
                                : diff < 0
                                ? "text-[var(--color-negative)]"
                                : "text-muted-foreground"
                            )}
                          >
                            {diff > 0 ? "+" : ""}
                            {diff.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isSelected && (
                          <Badge className="bg-[var(--color-tertiary)] text-white text-xs">
                            選択中
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </>
            )}
          </CardContent>
        </Card>

        {/* L3: 仕訳一覧 */}
        {selectedMonth && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base text-[var(--color-text-primary)]">
                {selectedMonth}の仕訳一覧
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={filteredJournals.length === 0}
                >
                  <Download className="h-4 w-4 mr-1" />
                  CSVエクスポート
                </Button>
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-[var(--color-primary)] transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  月次推移に戻る
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {/* フィルタバー */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="摘要・取引先で検索..."
                    value={searchText}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">金額</span>
                  <Input
                    type="number"
                    placeholder="最小"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    className="w-28"
                  />
                  <span className="text-muted-foreground">〜</span>
                  <Input
                    type="number"
                    placeholder="最大"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    className="w-28"
                  />
                </div>
              </div>
              {journals.isLoading ? (
                <div className="py-8 text-center text-muted-foreground">
                  読み込み中...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日付</TableHead>
                      <TableHead>借方科目</TableHead>
                      <TableHead>貸方科目</TableHead>
                      <TableHead className="text-right">金額</TableHead>
                      <TableHead>摘要</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJournals.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell className="text-sm">{j.date}</TableCell>
                        <TableCell className="text-sm">{j.debit}</TableCell>
                        <TableCell className="text-sm">{j.credit}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          ¥{j.amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {j.description}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredJournals.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          仕訳データがありません
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
