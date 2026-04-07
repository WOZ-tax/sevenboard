"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";

// P-3: チャートの遅延ロード（Rechartsバンドルをメインチャンクから分離）
const RevenueChart = dynamic(
  () => import("@/components/dashboard/revenue-chart").then((m) => ({ default: m.RevenueChart })),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded-lg bg-muted" />,
  },
);
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatManYen } from "@/lib/format";
import {
  useMfDashboard,
  useMfPLTransition,
  useAiSummary,
  useAlerts,
} from "@/hooks/use-mf-data";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";

const alertLevelConfig = {
  critical: {
    icon: AlertCircle,
    color: "text-[var(--color-error)]",
    bg: "bg-[#fce4ec]",
    badge: "bg-[#fce4ec] text-[var(--color-error)]",
    label: "重要",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-[#8d6e00]",
    bg: "bg-[#fff8e1]",
    badge: "bg-[#fff8e1] text-[#8d6e00]",
    label: "注意",
  },
  info: {
    icon: Info,
    color: "text-[var(--color-info)]",
    bg: "bg-[#e1f5fe]",
    badge: "bg-[#e1f5fe] text-[var(--color-info)]",
    label: "情報",
  },
};

const kpiMeta = {
  revenue: { title: "売上高", unit: "円" },
  operatingProfit: { title: "営業利益", unit: "円" },
  cashBalance: { title: "現預金残高", unit: "円" },
  runway: { title: "ランウェイ", unit: "か月" },
} as const;

export default function DashboardPage() {
  const [comparisonMode, setComparisonMode] = useState<"mom" | "yoy">("mom");
  const dashboard = useMfDashboard();
  const plTransition = useMfPLTransition();
  const aiSummaryQuery = useAiSummary();
  const alertsQuery = useAlerts();
  const { fiscalYear, month, periods } = usePeriodStore();

  const comparisonLabel = comparisonMode === "mom" ? "前月比" : "前年比";

  const kpiKeys = ["revenue", "operatingProfit", "cashBalance", "runway"] as const;

  const kpis = dashboard.data
    ? kpiKeys.map((key) => {
        const meta = kpiMeta[key];
        const value = dashboard.data[key] ?? 0;
        return {
          title: meta.title,
          value,
          unit: meta.unit,
          comparisonLabel,
        };
      })
    : null;

  const periodLabel = getPeriodLabel(fiscalYear, month, periods);

  const isLoading = dashboard.isLoading;
  const isError = dashboard.isError;
  const hasNoData = !isLoading && !isError && !dashboard.data;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            ダッシュボード
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {periodLabel} 経営サマリー
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <QueryErrorState onRetry={() => dashboard.refetch()} />
        ) : hasNoData ? (
          <MfEmptyState />
        ) : kpis ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <KpiCard key={kpi.title} {...kpi} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">比較:</span>
              <div className="flex overflow-hidden rounded-md border border-input">
                <Button
                  variant={comparisonMode === "mom" ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-7 rounded-none px-3 text-xs",
                    comparisonMode === "mom" && "bg-[var(--color-primary)] text-white"
                  )}
                  onClick={() => setComparisonMode("mom")}
                >
                  前月比
                </Button>
                <Button
                  variant={comparisonMode === "yoy" ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-7 rounded-none px-3 text-xs",
                    comparisonMode === "yoy" && "bg-[var(--color-primary)] text-white"
                  )}
                  onClick={() => setComparisonMode("yoy")}
                >
                  前年比
                </Button>
              </div>
            </div>
          </>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueChart mfData={plTransition.data} />
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                <Bot className="h-5 w-5 text-[var(--color-secondary)]" />
                AIサマリー
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiSummaryQuery.isLoading ? (
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    AI生成中...
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {aiSummaryQuery.data?.summary || "AIサマリーを生成するにはMFクラウド会計を接続してください。"}
                  </p>
                  {aiSummaryQuery.data?.highlights &&
                    aiSummaryQuery.data.highlights.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {aiSummaryQuery.data.highlights.map((h, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className={cn(
                              "px-2 py-0.5 text-[10px]",
                              h.type === "positive" &&
                                "border-green-300 bg-green-100 text-green-700",
                              h.type === "negative" &&
                                "border-red-300 bg-red-100 text-red-700",
                              h.type === "neutral" &&
                                "border-gray-300 bg-gray-100 text-gray-700"
                            )}
                          >
                            {h.text}
                          </Badge>
                        ))}
                      </div>
                    )}
                  {aiSummaryQuery.data?.generatedAt && (
                    <div className="mt-4 text-xs text-muted-foreground/60">
                      生成日時:{" "}
                      {new Date(aiSummaryQuery.data.generatedAt).toLocaleString("ja-JP")}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              アラート
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : alertsQuery.data && alertsQuery.data.length > 0 ? (
              alertsQuery.data.map((alert: any) => {
                const level = alert.level || alert.severity || "info";
                const config = alertLevelConfig[level as keyof typeof alertLevelConfig] || alertLevelConfig.info;
                const Icon = config.icon;

                return (
                  <div
                    key={alert.id}
                    className={cn("flex items-start gap-3 rounded-lg p-3", config.bg)}
                  >
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", config.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="text-sm font-medium">{alert.title}</span>
                        <Badge
                          variant="secondary"
                          className={cn("px-1.5 py-0 text-[10px]", config.badge)}
                        >
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {alert.description || alert.message}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {alert.date || alert.createdAt?.slice(0, 10)}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                アラートはありません
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
