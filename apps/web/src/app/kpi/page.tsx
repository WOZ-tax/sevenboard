"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatManYen, formatPercent } from "@/lib/format";
import {
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  BarChart3,
  Users,
  Repeat,
  UserPlus,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMfDashboard } from "@/hooks/use-mf-data";

const kpiCards = [
  { title: "売上高", value: 12500, target: 12700, achievement: 98.4, trend: 5.2, icon: DollarSign, format: "manyen" as const },
  { title: "営業利益率", value: 22.4, target: 23.0, achievement: 97.4, trend: -1.2, icon: BarChart3, format: "percent" as const },
  { title: "LTV", value: 4800, target: 5000, achievement: 96.0, trend: 3.5, icon: Repeat, format: "manyen" as const },
  { title: "CAC", value: 320, target: 300, achievement: 93.8, trend: -2.8, icon: UserPlus, format: "manyen" as const },
  { title: "MRR", value: 1050, target: 1100, achievement: 95.5, trend: 4.1, icon: Target, format: "manyen" as const },
  { title: "契約社数", value: 48, target: 50, achievement: 96.0, trend: 2.0, icon: Users, format: "number" as const },
];

const mrrTrendData = [
  { month: "4月", mrr: 780, target: 800 },
  { month: "5月", mrr: 810, target: 825 },
  { month: "6月", mrr: 840, target: 850 },
  { month: "7月", mrr: 870, target: 875 },
  { month: "8月", mrr: 890, target: 900 },
  { month: "9月", mrr: 920, target: 930 },
  { month: "10月", mrr: 950, target: 960 },
  { month: "11月", mrr: 970, target: 990 },
  { month: "12月", mrr: 1000, target: 1020 },
  { month: "1月", mrr: 1020, target: 1050 },
  { month: "2月", mrr: 1030, target: 1075 },
  { month: "3月", mrr: 1050, target: 1100 },
];

const mrrWaterfallRaw: Array<{
  name: string;
  value: number;
  isTotal?: boolean;
  isPositive?: boolean;
}> = [
  { name: "期首MRR", value: 780, isTotal: true },
  { name: "New MRR", value: 150, isPositive: true },
  { name: "Expansion", value: 80, isPositive: true },
  { name: "Churned", value: -60, isPositive: false },
  { name: "Contraction", value: -20, isPositive: false },
  { name: "期末MRR", value: 930, isTotal: true },
];

// Compute stacked waterfall: transparent base + visible bar
const mrrWaterfallData = (() => {
  let running = 0;
  return mrrWaterfallRaw.map((d) => {
    if (d.isTotal) {
      running = d.value;
      return { name: d.name, base: 0, value: d.value, isTotal: true, isPositive: true };
    }
    const positive = d.isPositive ?? d.value >= 0;
    const base = d.value >= 0 ? running : running + d.value;
    running += d.value;
    return { name: d.name, base, value: Math.abs(d.value), isTotal: false, isPositive: positive };
  });
})();

function getWaterfallColor(entry: { isTotal: boolean; isPositive: boolean }) {
  if (entry.isTotal) return "#0077c7"; // blue
  return entry.isPositive ? "#16a34a" : "#dc2626"; // green / red
}

function formatKpiValue(
  value: number,
  format: "manyen" | "percent" | "number"
): string {
  if (format === "manyen") return formatManYen(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

function getAchievementColor(achievement: number): string {
  if (achievement >= 100) return "text-[var(--color-positive)]";
  if (achievement >= 95) return "text-amber-600";
  return "text-[var(--color-negative)]";
}

export default function KpiPage() {
  const [mounted, setMounted] = useState(false);
  const dashboard = useMfDashboard();

  useEffect(() => {
    setMounted(true);
  }, []);

  // MFデータが取れたら売上高と営業利益率だけ上書き
  const effectiveKpiCards = useMemo(() => {
    if (!dashboard.data) return kpiCards;
    return kpiCards.map((kpi) => {
      if (kpi.title === "売上高" && dashboard.data.revenue) {
        const mfRevenue = Math.round(dashboard.data.revenue / 10000); // 円→万円
        const achievement = kpi.target > 0 ? (mfRevenue / kpi.target) * 100 : 0;
        return { ...kpi, value: mfRevenue, achievement: Math.round(achievement * 10) / 10 };
      }
      if (kpi.title === "営業利益率" && dashboard.data.revenue && dashboard.data.operatingProfit !== undefined) {
        const ratio = dashboard.data.revenue > 0
          ? (dashboard.data.operatingProfit / dashboard.data.revenue) * 100
          : 0;
        const roundedRatio = Math.round(ratio * 10) / 10;
        const achievement = kpi.target > 0 ? (roundedRatio / kpi.target) * 100 : 0;
        return { ...kpi, value: roundedRatio, achievement: Math.round(achievement * 10) / 10 };
      }
      return kpi;
    });
  }, [dashboard.data]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            KPIトラッキング
          </h1>
          <p className="text-sm text-muted-foreground">
            2026年3月度 重要指標モニタリング
          </p>
        </div>

        {dashboard.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {effectiveKpiCards.map((kpi) => {
            const Icon = kpi.icon;
            const TrendIcon = kpi.trend >= 0 ? TrendingUp : TrendingDown;
            const trendColor =
              kpi.title === "CAC"
                ? kpi.trend <= 0
                  ? "text-[var(--color-positive)]"
                  : "text-[var(--color-negative)]"
                : kpi.trend >= 0
                  ? "text-[var(--color-positive)]"
                  : "text-[var(--color-negative)]";

            return (
              <Card key={kpi.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--color-tertiary)]" />
                      {kpi.title}
                    </span>
                    <span className={cn("flex items-center gap-1 text-xs", trendColor)}>
                      <TrendIcon className="h-3 w-3" />
                      {formatPercent(kpi.trend)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-[family-name:var(--font-inter)] text-2xl font-bold text-[var(--color-text-primary)]">
                    {formatKpiValue(kpi.value, kpi.format)}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>目標 {formatKpiValue(kpi.target, kpi.format)}</span>
                    <span
                      className={cn(
                        "font-[family-name:var(--font-inter)] font-semibold",
                        getAchievementColor(kpi.achievement)
                      )}
                    >
                      達成率 {kpi.achievement.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-[var(--color-primary)]"
                      style={{ width: `${Math.min(kpi.achievement, 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              MRR 分析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="trend">
              <TabsList>
                <TabsTrigger value="trend">推移</TabsTrigger>
                <TabsTrigger value="breakdown">内訳</TabsTrigger>
              </TabsList>

              <TabsContent value="trend">
                <div className="h-[300px] pt-4">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mrrTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#706d65" }} />
                        <YAxis tick={{ fontSize: 12, fill: "#706d65" }} />
                        <Tooltip
                          formatter={(value) => [formatManYen(Number(value)), undefined]}
                          contentStyle={{
                            borderRadius: "8px",
                            border: "1px solid #d6d3d0",
                            fontSize: "13px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "13px" }} />
                        <Line
                          type="monotone"
                          dataKey="mrr"
                          name="実績"
                          stroke="#0077c7"
                          strokeWidth={2.5}
                          dot={{ fill: "#0077c7", r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="target"
                          name="目標"
                          stroke="#0f7f85"
                          strokeWidth={2}
                          strokeDasharray="6 3"
                          dot={{ fill: "#0f7f85", r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="breakdown">
                <div className="h-[300px] pt-4">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mrrWaterfallData} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#706d65" }} />
                        <YAxis tick={{ fontSize: 12, fill: "#706d65" }} />
                        <Tooltip
                          formatter={(value, name) => {
                            if (String(name) === "base") return [null, null];
                            return [formatManYen(Number(value)), "MRR"];
                          }}
                          contentStyle={{
                            borderRadius: "8px",
                            border: "1px solid #d6d3d0",
                            fontSize: "13px",
                          }}
                        />
                        <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                        <Bar dataKey="value" stackId="waterfall" isAnimationActive={false} radius={[4, 4, 0, 0]}>
                          {mrrWaterfallData.map((entry, index) => (
                            <Cell key={index} fill={getWaterfallColor(entry)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
