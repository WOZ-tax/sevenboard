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

interface RawJournalDetail {
  debit_account_name?: string;
  credit_account_name?: string;
  account_item_name?: string;
  amount?: number;
  description?: string;
}

interface RawJournal {
  id?: string;
  date?: string;
  recognized_at?: string;
  amount?: number;
  description?: string;
  details?: RawJournalDetail[];
}

// 月名→月番号マップ（年度期間推定用）
const MONTH_MAP: Record<string, { month: number; offset: number }> = {
  "4月": { month: 4, offset: 0 },
  "5月": { month: 5, offset: 0 },
  "6月": { month: 6, offset: 0 },
  "7月": { month: 7, offset: 0 },
  "8月": { month: 8, offset: 0 },
  "9月": { month: 9, offset: 0 },
  "10月": { month: 10, offset: 0 },
  "11月": { month: 11, offset: 0 },
  "12月": { month: 12, offset: 0 },
  "1月": { month: 1, offset: 1 },
  "2月": { month: 2, offset: 1 },
  "3月": { month: 3, offset: 1 },
};

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

  const [selectedMonth, setSelectedMonth] = useState<string | null>(
    monthParam ? `${monthParam}月` : null
  );

  const transition = useMfAccountTransition(accountName);

  // 仕訳クエリ用のdate range計算
  const journalParams = useMemo(() => {
    if (!selectedMonth) return undefined;
    const m = MONTH_MAP[selectedMonth];
    if (!m) return undefined;
    const year = new Date().getFullYear() + (m.offset ? 0 : (m.month >= 4 ? 0 : 1));
    const startDate = `${year}-${String(m.month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, m.month, 0).getDate();
    const endDate = `${year}-${String(m.month).padStart(2, "0")}-${lastDay}`;
    return { startDate, endDate, accountName };
  }, [selectedMonth, accountName]);

  const journals = useMfJournals(journalParams);

  // モックデータフォールバック
  const transitionData = useMemo(() => {
    if (transition.data && transition.data.length > 0) return transition.data;
    return [
      { month: "4月", amount: 120000 },
      { month: "5月", amount: 85000 },
      { month: "6月", amount: 230000 },
      { month: "7月", amount: 150000 },
      { month: "8月", amount: 95000 },
      { month: "9月", amount: 310000 },
      { month: "10月", amount: 175000 },
      { month: "11月", amount: 140000 },
      { month: "12月", amount: 280000 },
      { month: "1月", amount: 110000 },
      { month: "2月", amount: 90000 },
      { month: "3月", amount: 200000 },
    ];
  }, [transition.data]);

  const journalList = useMemo(() => {
    if (journals.data?.journals && journals.data.journals.length > 0) {
      return (journals.data.journals as RawJournal[]).map((j, idx): JournalRow => ({
        id: j.id || String(idx),
        date: j.date || j.recognized_at || "",
        debit: j.details?.[0]?.debit_account_name || j.details?.[0]?.account_item_name || "",
        credit: j.details?.[0]?.credit_account_name || "",
        amount: j.details?.[0]?.amount || j.amount || 0,
        description: j.description || j.details?.[0]?.description || "",
      }));
    }
    // モックデータ
    if (!selectedMonth) return [];
    return [
      { id: "1", date: "2026-09-05", debit: accountName || "接待交際費", credit: "現金", amount: 45000, description: "取引先接待 レストランA" },
      { id: "2", date: "2026-09-12", debit: accountName || "接待交際費", credit: "普通預金", amount: 120000, description: "顧客接待 ゴルフ" },
      { id: "3", date: "2026-09-18", debit: accountName || "接待交際費", credit: "現金", amount: 38000, description: "取引先会食 居酒屋B" },
      { id: "4", date: "2026-09-25", debit: accountName || "接待交際費", credit: "未払金", amount: 85000, description: "パートナー企業接待" },
      { id: "5", date: "2026-09-28", debit: accountName || "接待交際費", credit: "現金", amount: 22000, description: "お中元・贈答品" },
    ];
  }, [journals.data, selectedMonth, accountName]);

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
      <div className="space-y-6">
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
