"use client";

import { useState, useMemo, useCallback } from "react";
import { useIsClient } from "@/hooks/use-is-client";
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
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/ui/print-button";
import { TrendingDown, TrendingUp, ShieldCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatManYen } from "@/lib/format";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { useVariableCost, useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";

const mockVariableCostData = {
  revenue: 12500,
  variableCosts: [
    { name: "売上原価", amount: 4000 },
    { name: "人件費", amount: 2930 },
    { name: "広告宣伝費", amount: 100 },
    { name: "旅費交通費", amount: 50 },
    { name: "通信費", amount: 20 },
    { name: "消耗品費", amount: 30 },
    { name: "支払手数料", amount: 30 },
    { name: "その他販管費", amount: 30 },
  ],
  fixedCosts: [
    { name: "地代家賃", amount: 800 },
    { name: "役員報酬", amount: 1000 },
    { name: "減価償却費", amount: 200 },
    { name: "採用費", amount: 200 },
  ],
};

const months = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"];

function formatRatio(value: number): string {
  if (!isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function VariableCostSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default function VariableCostPage() {
  const [selectedMonth, setSelectedMonth] = useState("3月");
  const [viewMode, setViewMode] = useState<"monthly" | "cumulative">("monthly");
  const mounted = useIsClient();
  const vcQuery = useVariableCost();
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);

  // APIデータが取れたらモックを上書き、エラー時はモックフォールバック
  const sourceData: {
    revenue: number;
    variableCosts: { name: string; amount: number }[];
    fixedCosts: { name: string; amount: number }[];
  } = vcQuery.data
    ? {
        revenue: vcQuery.data.revenue as number,
        variableCosts: vcQuery.data.variableCosts as { name: string; amount: number }[],
        fixedCosts: vcQuery.data.fixedCosts as { name: string; amount: number }[],
      }
    : mockVariableCostData;

  // デフォルト分類マップ: true=変動費, false=固定費
  const defaultClassification = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const item of sourceData.variableCosts) {
      map[item.name] = true;
    }
    for (const item of sourceData.fixedCosts) {
      map[item.name] = false;
    }
    return map;
  }, [sourceData.variableCosts, sourceData.fixedCosts]);

  // カスタム分類: 未設定(undefined)の場合はデフォルト分類を使用
  const [customClassification, setCustomClassification] = useState<Record<string, boolean>>({});

  const isVariable = useCallback(
    (name: string): boolean => {
      if (customClassification[name] !== undefined) {
        return customClassification[name];
      }
      return defaultClassification[name] ?? true;
    },
    [customClassification, defaultClassification]
  );

  const toggleClassification = useCallback(
    (name: string) => {
      setCustomClassification((prev) => ({
        ...prev,
        [name]: prev[name] !== undefined ? !prev[name] : !defaultClassification[name],
      }));
    },
    [defaultClassification]
  );

  const resetClassification = useCallback(() => {
    setCustomClassification({});
  }, []);

  const hasCustomChanges = Object.keys(customClassification).length > 0;

  // 全科目リスト（変動費・固定費を統合）
  const allItems = useMemo(
    () => [...sourceData.variableCosts, ...sourceData.fixedCosts],
    [sourceData.variableCosts, sourceData.fixedCosts]
  );

  // カスタム分類に基づく再分類
  const data = useMemo(() => {
    const variableCosts = allItems.filter((item) => isVariable(item.name));
    const fixedCosts = allItems.filter((item) => !isVariable(item.name));
    return { revenue: sourceData.revenue, variableCosts, fixedCosts };
  }, [allItems, isVariable, sourceData.revenue]);

  const totalVariableCost = useMemo(
    () => data.variableCosts.reduce((sum, c) => sum + c.amount, 0),
    [data.variableCosts]
  );
  const totalFixedCost = useMemo(
    () => data.fixedCosts.reduce((sum, c) => sum + c.amount, 0),
    [data.fixedCosts]
  );
  const marginalProfit = data.revenue - totalVariableCost;
  const marginalProfitRatio = data.revenue > 0 ? (marginalProfit / data.revenue) * 100 : 0;
  const breakEvenPoint = marginalProfitRatio > 0 ? totalFixedCost / (marginalProfitRatio / 100) : 0;
  const safetyMargin = data.revenue > 0 ? ((data.revenue - breakEvenPoint) / data.revenue) * 100 : 0;
  const operatingProfit = marginalProfit - totalFixedCost;

  const chartData = useMemo(() => {
    const maxRevenue = Math.ceil((data.revenue * 1.5) / 1000) * 1000;
    const steps = 30;
    const variableCostRatio = data.revenue > 0 ? totalVariableCost / data.revenue : 0;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const rev = (maxRevenue / steps) * i;
      const vc = rev * variableCostRatio;
      const tc = totalFixedCost + vc;
      points.push({
        revenue: Math.round(rev),
        salesLine: Math.round(rev),
        totalCost: Math.round(tc),
        fixedCostLine: totalFixedCost,
      });
    }
    return points;
  }, [data.revenue, totalVariableCost, totalFixedCost]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">変動損益分析</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}（{selectedMonth}・{viewMode === "monthly" ? "単月" : "累計"}）
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        <div className="flex items-center justify-between screen-only">
          <div>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-[var(--color-text-primary)]" />
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                変動損益分析
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">{periodLabel || "2026年3月度"}</p>
          </div>
          <PrintButton />
        </div>

        <div className="flex flex-wrap items-center gap-3 screen-only">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-md border border-input">
            <Button
              variant={viewMode === "monthly" ? "default" : "ghost"}
              size="sm"
              className={cn("h-9 rounded-none text-xs", viewMode === "monthly" && "bg-[var(--color-primary)] text-white")}
              onClick={() => setViewMode("monthly")}
            >
              単月
            </Button>
            <Button
              variant={viewMode === "cumulative" ? "default" : "ghost"}
              size="sm"
              className={cn("h-9 rounded-none text-xs", viewMode === "cumulative" && "bg-[var(--color-primary)] text-white")}
              onClick={() => setViewMode("cumulative")}
            >
              累計
            </Button>
          </div>
        </div>

        {vcQuery.isLoading ? <VariableCostSkeleton /> : <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-[var(--color-tertiary)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-[var(--color-tertiary)]" />
                <div>
                  <div className="text-sm text-muted-foreground">限界利益</div>
                  <div className="font-[family-name:var(--font-inter)] text-2xl font-bold text-[var(--color-text-primary)]">
                    {formatManYen(marginalProfit)}
                  </div>
                  <div className="text-xs font-semibold text-[var(--color-tertiary)]">
                    限界利益率 {formatRatio(marginalProfitRatio)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-400">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-8 w-8 text-red-400" />
                <div>
                  <div className="text-sm text-muted-foreground">損益分岐点売上高</div>
                  <div className="font-[family-name:var(--font-inter)] text-2xl font-bold text-[var(--color-text-primary)]">
                    {formatManYen(Math.round(breakEvenPoint))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    固定費 {formatManYen(totalFixedCost)} / 限界利益率 {formatRatio(marginalProfitRatio)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-green-500" />
                <div>
                  <div className="text-sm text-muted-foreground">安全余裕率</div>
                  <div
                    className={cn(
                      "font-[family-name:var(--font-inter)] text-2xl font-bold",
                      safetyMargin >= 20 ? "text-green-600" : safetyMargin >= 10 ? "text-yellow-600" : "text-red-600"
                    )}
                  >
                    {formatRatio(safetyMargin)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    (売上高 - BEP) / 売上高
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                変動損益計算書
              </CardTitle>
              {hasCustomChanges && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                  onClick={resetClassification}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  デフォルトに戻す
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
                    <TableHead className="w-56 font-semibold text-[var(--color-text-primary)]">勘定科目</TableHead>
                    <TableHead className="w-24 text-center font-semibold text-[var(--color-text-primary)]">分類</TableHead>
                    <TableHead className="w-36 text-right font-semibold text-[var(--color-text-primary)]">金額</TableHead>
                    <TableHead className="w-28 text-right font-semibold text-[var(--color-text-primary)]">構成比</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell className="font-bold text-[var(--color-text-primary)]">売上高</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{formatManYen(data.revenue)}</TableCell>
                    <TableCell className="text-right">100.0%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-[var(--color-text-primary)]">変動費</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </TableRow>
                  {data.variableCosts.map((item) => (
                    <TableRow key={`v-${item.name}`}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">{item.name}</TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleClassification(item.name)}
                          className="cursor-pointer"
                        >
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400">
                            変動
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatManYen(item.amount)}</TableCell>
                      <TableCell className="text-right text-sm">{formatRatio((item.amount / data.revenue) * 100)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">変動費合計</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{formatManYen(totalVariableCost)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatRatio((totalVariableCost / data.revenue) * 100)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-[var(--color-tertiary)]/5">
                    <TableCell className="font-bold text-[var(--color-tertiary)]">限界利益</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-bold text-[var(--color-tertiary)]">{formatManYen(marginalProfit)}</TableCell>
                    <TableCell className="text-right font-bold text-[var(--color-tertiary)]">{formatRatio(marginalProfitRatio)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-[var(--color-text-primary)]">固定費</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </TableRow>
                  {data.fixedCosts.map((item) => (
                    <TableRow key={`f-${item.name}`}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">{item.name}</TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleClassification(item.name)}
                          className="cursor-pointer"
                        >
                          <Badge variant="secondary" className="hover:bg-muted">
                            固定
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatManYen(item.amount)}</TableCell>
                      <TableCell className="text-right text-sm">{formatRatio((item.amount / data.revenue) * 100)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">固定費合計</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{formatManYen(totalFixedCost)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatRatio((totalFixedCost / data.revenue) * 100)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-bold text-[var(--color-text-primary)]">営業利益</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-bold text-[var(--color-text-primary)]">{formatManYen(operatingProfit)}</TableCell>
                    <TableCell className="text-right font-bold">{formatRatio((operatingProfit / data.revenue) * 100)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              損益分岐点チャート
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="revenue" />
                    <YAxis />
                    <Tooltip
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          salesLine: "売上高",
                          totalCost: "総費用",
                          fixedCostLine: "固定費",
                        };
                        return [formatManYen(Number(value)), labels[String(name)] || String(name)];
                      }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="fixedCostLine" name="固定費" stroke="#94a3b8" fill="var(--color-border)" fillOpacity={0.4} />
                    <Line type="monotone" dataKey="totalCost" name="総費用" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="salesLine" name="売上高" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} />
                    <ReferenceDot
                      x={Math.round(breakEvenPoint)}
                      y={Math.round(breakEvenPoint)}
                      r={7}
                      fill="#ef4444"
                      stroke="#fff"
                      strokeWidth={2}
                      label={{ value: `BEP: ${formatManYen(Math.round(breakEvenPoint))}`, position: "top", fontSize: 12, fill: "#ef4444" }}
                    />
                    <ReferenceLine
                      x={data.revenue}
                      stroke="var(--color-tertiary)"
                      strokeDasharray="4 4"
                      label={{ value: `現在売上 ${formatManYen(data.revenue)}`, position: "top", fontSize: 11, fill: "var(--color-tertiary)" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </CardContent>
        </Card>
        </>}
      </div>
    </DashboardShell>
  );
}
