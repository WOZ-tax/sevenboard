"use client";

import { useState, useMemo, useCallback } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FlaskConical, Play, AlertTriangle, RotateCcw } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useWhatIfSimulation } from "@/hooks/use-mf-data";
import type { WhatIfResult } from "@/lib/api-types";

function formatYen(value: number): string {
  const absVal = Math.abs(value);
  if (absVal >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1)}億`;
  }
  if (absVal >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString()}万`;
  }
  return value.toLocaleString();
}

function ChangeCell({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-medium",
        value > 0
          ? "text-[var(--color-positive)]"
          : value < 0
          ? "text-[var(--color-negative)]"
          : "text-muted-foreground"
      )}
    >
      {value > 0 ? "+" : ""}
      ¥{formatYen(value)}
    </span>
  );
}

// モックベースの簡易計算
function localSimulate(params: {
  revenueChangePercent: number;
  costChangePercent: number;
  newHires: number;
  additionalInvestment: number;
}): WhatIfResult {
  const before = {
    revenue: 500_000_000,
    operatingProfit: 50_000_000,
    cashBalance: 120_000_000,
    runway: 18.5,
  };

  const revChange = before.revenue * (params.revenueChangePercent / 100);
  const costChange = (before.revenue - before.operatingProfit) * (params.costChangePercent / 100);
  const hireCost = params.newHires * 6_000_000;
  const profitChange = revChange - costChange - hireCost;
  const cashChange = profitChange - params.additionalInvestment;
  const monthlyExpense = (before.revenue - before.operatingProfit + costChange + hireCost) / 12;

  return {
    before,
    after: {
      revenue: before.revenue + revChange,
      operatingProfit: before.operatingProfit + profitChange,
      cashBalance: before.cashBalance + cashChange,
      runway: monthlyExpense > 0
        ? Math.round(((before.cashBalance + cashChange) / monthlyExpense) * 10) / 10
        : 999,
    },
    impact: {
      revenueChange: Math.round(revChange),
      costChange: Math.round(-costChange),
      hireChange: Math.round(-hireCost),
      investmentChange: Math.round(-params.additionalInvestment),
      profitChange: Math.round(profitChange),
      cashChange: Math.round(cashChange),
      runwayChange: 0,
    },
  };
}

export default function SimulationPage() {
  const [revenueChangePercent, setRevenueChangePercent] = useState(0);
  const [costChangePercent, setCostChangePercent] = useState(0);
  const [newHires, setNewHires] = useState(0);
  const [additionalInvestment, setAdditionalInvestment] = useState(0);

  const [hasSimulated, setHasSimulated] = useState(false);

  const mutation = useWhatIfSimulation();

  const handleReset = useCallback(() => {
    setRevenueChangePercent(0);
    setCostChangePercent(0);
    setNewHires(0);
    setAdditionalInvestment(0);
    setHasSimulated(false);
  }, []);

  const handleSimulate = useCallback(() => {
    setHasSimulated(true);
    mutation.mutate({
      revenueChangePercent,
      costChangePercent,
      newHires,
      additionalInvestment,
    });
  }, [mutation, revenueChangePercent, costChangePercent, newHires, additionalInvestment]);

  // API結果があればそれを使い、なければローカル計算
  const result = useMemo(() => {
    if (mutation.data) return mutation.data;
    return localSimulate({
      revenueChangePercent,
      costChangePercent,
      newHires,
      additionalInvestment,
    });
  }, [mutation.data, revenueChangePercent, costChangePercent, newHires, additionalInvestment]);

  const runwayAfter = result.after?.runway || 0;
  const runwayAlert =
    runwayAfter < 6 ? "critical" : runwayAfter < 12 ? "warning" : "safe";

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3">
          <FlaskConical className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              What-if シミュレーション
            </h1>
            <p className="text-sm text-muted-foreground">
              パラメータを変更して経営への影響を予測
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左: パラメータ入力 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base text-[var(--color-text-primary)]">
                シミュレーション条件
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-muted-foreground hover:text-[var(--color-text-primary)]"
              >
                <RotateCcw className="mr-1 h-4 w-4" />
                リセット
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 売上変動率 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>売上変動率</Label>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {revenueChangePercent > 0 ? "+" : ""}
                    {revenueChangePercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={100}
                  step={5}
                  value={revenueChangePercent}
                  onChange={(e) => setRevenueChangePercent(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-gray-200 accent-[var(--color-primary)]"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>-50%</span>
                  <span>0%</span>
                  <span>+100%</span>
                </div>
              </div>

              {/* 費用変動率 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>費用変動率</Label>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {costChangePercent > 0 ? "+" : ""}
                    {costChangePercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={50}
                  step={5}
                  value={costChangePercent}
                  onChange={(e) => setCostChangePercent(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-gray-200 accent-[var(--color-primary)]"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>-30%</span>
                  <span>0%</span>
                  <span>+50%</span>
                </div>
              </div>

              {/* 新規採用 */}
              <div className="space-y-2">
                <Label>新規採用人数</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={newHires}
                  onChange={(e) => setNewHires(Math.max(0, Math.min(20, Number(e.target.value))))}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  一人あたり年間人件費は現在の平均値で計算
                </p>
              </div>

              {/* 追加投資 */}
              <div className="space-y-2">
                <Label>追加投資額（万円）</Label>
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  value={Math.round(additionalInvestment / 10000)}
                  onChange={(e) =>
                    setAdditionalInvestment(
                      Math.max(0, Math.min(100_000_000, Number(e.target.value) * 10000))
                    )
                  }
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  0 〜 10,000万円（1億円）
                </p>
              </div>

              <Button
                className="w-full bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                onClick={handleSimulate}
                disabled={mutation.isPending}
              >
                <Play className="mr-2 h-4 w-4" />
                {mutation.isPending ? "計算中..." : "シミュレーション実行"}
              </Button>
            </CardContent>
          </Card>

          {/* 右: 結果表示 */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-[var(--color-text-primary)]">
                  Before / After 比較
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>項目</TableHead>
                      <TableHead className="text-right">Before</TableHead>
                      <TableHead className="text-right">After</TableHead>
                      <TableHead className="text-right">変動</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">売上高</TableCell>
                      <TableCell className="text-right">
                        ¥{formatYen(result.before?.revenue || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        ¥{formatYen(result.after?.revenue || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ChangeCell value={result.impact?.revenueChange || 0} />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">営業利益</TableCell>
                      <TableCell className="text-right">
                        ¥{formatYen(result.before?.operatingProfit || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        ¥{formatYen(result.after?.operatingProfit || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ChangeCell value={result.impact?.profitChange || 0} />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">現預金残高</TableCell>
                      <TableCell className="text-right">
                        ¥{formatYen(result.before?.cashBalance || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        ¥{formatYen(result.after?.cashBalance || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ChangeCell value={result.impact?.cashChange || 0} />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">ランウェイ</TableCell>
                      <TableCell className="text-right">
                        {result.before?.runway || 0}ヶ月
                      </TableCell>
                      <TableCell className="text-right">
                        {result.after?.runway || 0}ヶ月
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "font-medium",
                            (result.impact?.runwayChange || 0) > 0
                              ? "text-[var(--color-positive)]"
                              : (result.impact?.runwayChange || 0) < 0
                              ? "text-[var(--color-negative)]"
                              : "text-muted-foreground"
                          )}
                        >
                          {(result.impact?.runwayChange || 0) > 0 ? "+" : ""}
                          {result.impact?.runwayChange || 0}ヶ月
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* ランウェイアラート */}
            {runwayAlert !== "safe" && (
              <Card
                className={cn(
                  "border-2",
                  runwayAlert === "critical"
                    ? "border-red-300 bg-[#fce4ec]"
                    : "border-amber-300 bg-[#fff8e1]"
                )}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <AlertTriangle
                    className={cn(
                      "h-5 w-5 shrink-0",
                      runwayAlert === "critical"
                        ? "text-[var(--color-error)]"
                        : "text-[#f9a825]"
                    )}
                  />
                  <div>
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        runwayAlert === "critical"
                          ? "text-[var(--color-error)]"
                          : "text-[#8d6e00]"
                      )}
                    >
                      {runwayAlert === "critical"
                        ? "ランウェイが6ヶ月を下回ります"
                        : "ランウェイが12ヶ月を下回ります"}
                    </div>
                    <div
                      className={cn(
                        "text-xs",
                        runwayAlert === "critical"
                          ? "text-[var(--color-error)]"
                          : "text-[#8d6e00]"
                      )}
                    >
                      このシナリオでは資金繰りに注意が必要です。
                      {runwayAlert === "critical" &&
                        "早急な対策を検討してください。"}
                    </div>
                  </div>
                  <Badge
                    className={cn(
                      "ml-auto border",
                      runwayAlert === "critical"
                        ? "bg-[#fce4ec] text-[var(--color-error)] border-red-300"
                        : "bg-[#fff8e1] text-[#8d6e00] border-amber-300"
                    )}
                  >
                    {runwayAlert === "critical" ? "危険" : "注意"}
                  </Badge>
                </CardContent>
              </Card>
            )}

            {mutation.isError && (
              <Card className="border-red-300 bg-red-50">
                <CardContent className="p-4 text-sm text-red-700">
                  シミュレーションでエラーが発生しました。モックデータで表示しています。
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* インパクト・ウォーターフォールチャート */}
        {hasSimulated && (() => {
          const beforeProfit = result.before?.operatingProfit || 0;
          const afterProfit = result.after?.operatingProfit || 0;
          const revImpact = result.impact?.revenueChange || 0;
          const costImpact = result.impact?.costChange || 0;
          const hireImpact = result.impact?.hireChange || 0;
          const investImpact = result.impact?.investmentChange || 0;

          const waterfallData = [
            {
              name: "現在の営業利益",
              value: beforeProfit,
              base: 0,
              fill: "var(--color-primary)",
              isTotal: true,
            },
            {
              name: "売上変動",
              value: revImpact,
              base: revImpact >= 0 ? beforeProfit : beforeProfit + revImpact,
              fill: revImpact >= 0 ? "#4caf50" : "#f44336",
              isTotal: false,
            },
            {
              name: "費用変動",
              value: costImpact,
              base: costImpact >= 0
                ? beforeProfit + revImpact
                : beforeProfit + revImpact + costImpact,
              fill: costImpact >= 0 ? "#4caf50" : "#f44336",
              isTotal: false,
            },
            {
              name: "採用",
              value: hireImpact,
              base: hireImpact >= 0
                ? beforeProfit + revImpact + costImpact
                : beforeProfit + revImpact + costImpact + hireImpact,
              fill: hireImpact >= 0 ? "#4caf50" : "#f44336",
              isTotal: false,
            },
            {
              name: "投資",
              value: investImpact,
              base: investImpact >= 0
                ? beforeProfit + revImpact + costImpact + hireImpact
                : beforeProfit + revImpact + costImpact + hireImpact + investImpact,
              fill: investImpact >= 0 ? "#4caf50" : "#f44336",
              isTotal: false,
            },
            {
              name: "変動後の営業利益",
              value: afterProfit,
              base: 0,
              fill: "var(--color-primary)",
              isTotal: true,
            },
          ];

          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-[var(--color-text-primary)]">
                  インパクト・ウォーターフォール
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={waterfallData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => formatYen(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => [`¥${formatYen(Number(value))}`, "金額"]}
                    />
                    <ReferenceLine x={0} stroke="#666" />
                    {/* 透明ベースバー */}
                    <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                    {/* 値バー */}
                    <Bar dataKey="value" stackId="waterfall" isAnimationActive={false}>
                      {waterfallData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.fill}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </DashboardShell>
  );
}
