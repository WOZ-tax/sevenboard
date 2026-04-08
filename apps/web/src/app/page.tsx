"use client";

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

function buildKpis(data: any) {
  const revenue = data.revenue ?? 0;
  const opProfit = data.operatingProfit ?? 0;
  const cashBalance = data.cashBalance ?? 0;
  const runway = data.runway ?? 0;
  const opMargin = revenue > 0 ? Math.round((opProfit / revenue) * 1000) / 10 : 0;

  return [
    {
      title: "売上高",
      value: Math.round(revenue / 10000),
      unit: "万円",
    },
    {
      title: "営業利益",
      value: Math.round(opProfit / 10000),
      unit: "万円",
    },
    {
      title: "営業利益率",
      value: opMargin,
      unit: "%",
    },
    {
      title: "現預金残高",
      value: Math.round(cashBalance / 10000),
      unit: "万円",
    },
    {
      title: "ランウェイ",
      value: runway,
      unit: "か月",
    },
  ];
}

export default function DashboardPage() {
  const dashboard = useMfDashboard();
  const plTransition = useMfPLTransition();
  const aiSummaryQuery = useAiSummary();
  const alertsQuery = useAlerts();
  const { fiscalYear, month, periods } = usePeriodStore();

  const kpis = dashboard.data ? buildKpis(dashboard.data) : null;

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <QueryErrorState onRetry={() => dashboard.refetch()} />
        ) : hasNoData ? (
          <MfEmptyState />
        ) : kpis ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {kpis.map((kpi) => (
                <KpiCard key={kpi.title} {...kpi} />
              ))}
            </div>
          </>
        ) : null}

        <RevenueChart mfData={plTransition.data} />

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
                {aiSummaryQuery.data?.sections &&
                  aiSummaryQuery.data.sections.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {aiSummaryQuery.data.sections.map((s: any, i: number) => (
                        <div key={i} className="rounded-lg border border-[var(--color-border)] bg-muted/20 p-3">
                          <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                            {s.title}
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {s.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                {aiSummaryQuery.data?.highlights &&
                  aiSummaryQuery.data.highlights.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {aiSummaryQuery.data.highlights.map((h: any, i: number) => (
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
                  <div className="mt-3 text-right text-xs text-muted-foreground/60">
                    生成日時:{" "}
                    {new Date(aiSummaryQuery.data.generatedAt).toLocaleString("ja-JP")}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

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
