"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CashflowTable } from "@/components/cashflow/cashflow-table";
import { CashflowChart } from "@/components/cashflow/cashflow-chart";
import { Shield, Link2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatManYen } from "@/lib/format";
import { useMfCashflow } from "@/hooks/use-mf-data";
import { AgentBanner } from "@/components/agent/agent-banner";
import { AGENTS } from "@/lib/agent-voice";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { Button } from "@/components/ui/button";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { SentinelCard } from "@/components/dashboard/sentinel-card";
import { api, isMfNotConnected } from "@/lib/api";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { useAuthStore } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_CERTAINTY_RULES,
  type CertaintyLevel,
} from "@/lib/cashflow-certainty";

const alertLevelConfig = {
  SAFE: {
    card: "border-l-green-500",
    color: "bg-green-100 text-green-700 border-green-300",
    dot: "bg-green-500",
    label: "安全",
    description: "ランウェイ12か月以上。現時点で資金繰りに大きな懸念はありません。",
  },
  CAUTION: {
    card: "border-l-yellow-500",
    color: "bg-yellow-100 text-yellow-700 border-yellow-300",
    dot: "bg-yellow-500",
    label: "警戒",
    description: "ランウェイ6〜12か月。キャッシュイン施策と支出抑制の検討を推奨します。",
  },
  WARNING: {
    card: "border-l-orange-500",
    color: "bg-orange-100 text-orange-700 border-orange-300",
    dot: "bg-orange-500",
    label: "注意",
    description: "ランウェイ3〜6か月。早期の入金前倒し・支出繰延・融資検討が必要です。",
  },
  CRITICAL: {
    card: "border-l-red-500",
    color: "bg-red-100 text-red-700 border-red-300",
    dot: "bg-red-500",
    label: "危険",
    description: "ランウェイ3か月未満。緊急の資金調達策を直ちに実行してください。",
  },
} as const;

type AlertLevelKey = keyof typeof alertLevelConfig;

export default function CashflowPage() {
  const mfCashflow = useMfCashflow();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";

  const certaintyQuery = useQuery({
    queryKey: ["cashflow-certainty", orgId],
    queryFn: () => api.cashflowCertainty.get(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const runwayData = mfCashflow.data?.runway ?? null;
  const mfNotConnected = isMfNotConnected(mfCashflow.error);
  const isError = mfCashflow.isError && !mfNotConnected;
  const isLoading = mfCashflow.isLoading;

  const alertKey: AlertLevelKey =
    runwayData && runwayData.alertLevel in alertLevelConfig
      ? (runwayData.alertLevel as AlertLevelKey)
      : "SAFE";
  const config = alertLevelConfig[alertKey];

  const certaintyLevels: Record<string, CertaintyLevel> | undefined = mfCashflow.data
    ? {
        ...DEFAULT_CERTAINTY_RULES,
        ...(certaintyQuery.data?.rules ?? {}),
      }
    : undefined;

  const bannerStatus = mfNotConnected
    ? "idle"
    : isError
      ? "alert"
      : runwayData
        ? runwayData.alertLevel === "CRITICAL" || runwayData.alertLevel === "WARNING"
          ? "alert"
          : "ok"
        : "unknown";

  const lastFetchedAt = mfCashflow.dataUpdatedAt
    ? new Date(mfCashflow.dataUpdatedAt).toLocaleString("ja-JP")
    : null;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              資金繰り
            </h1>
            <p className="text-sm text-muted-foreground">
              {periodLabel ? `${periodLabel} ` : ""}月次推移と資金残高予測
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => mfCashflow.refetch()}
            disabled={mfCashflow.isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", mfCashflow.isFetching && "animate-spin")} />
            再取得
          </Button>
        </div>

        <AgentBanner
          agent={AGENTS.sentinel}
          status={bannerStatus}
          detectionCount={
            runwayData && (runwayData.alertLevel === "CRITICAL" || runwayData.alertLevel === "WARNING")
              ? 1
              : 0
          }
          lastUpdatedAt={mfCashflow.dataUpdatedAt ? new Date(mfCashflow.dataUpdatedAt).toISOString() : new Date().toISOString()}
          actions={
            <CopilotOpenButton
              agentKey="sentinel"
              mode="dialog"
              seed="現在の資金リスクと、想定される枯渇予兆・推奨アクションをドラフトで整理してください。"
            />
          }
        />

        <SentinelCard />

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : mfNotConnected ? (
          <MfEmptyState />
        ) : isError ? (
          <QueryErrorState onRetry={() => mfCashflow.refetch()} />
        ) : !runwayData ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              資金繰りデータが取得できませんでした。MF推移表の期間設定を確認してください。
            </CardContent>
          </Card>
        ) : (
          <Card className={cn("border-l-4", config.card)}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Shield className="h-10 w-10 text-[var(--color-text-primary)]" />
                  <div>
                    <div className="text-sm text-muted-foreground">
                      ランウェイ（想定月数）
                    </div>
                    <div className="text-3xl font-bold text-[var(--color-text-primary)] font-[family-name:var(--font-inter)]">
                      {runwayData.months.toFixed(1)}
                      <span className="ml-1 text-base font-normal text-muted-foreground">
                        か月
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={cn("border px-3 py-1 text-sm", config.color)}>
                    <span
                      className={cn("mr-2 inline-block h-2 w-2 rounded-full", config.dot)}
                    />
                    {config.label}
                  </Badge>
                  <div className="space-y-0.5 text-right text-xs text-muted-foreground">
                    <div>現預金残高: {formatManYen(runwayData.cashBalance)}</div>
                    <div>月次バーンレート: {formatManYen(runwayData.monthlyBurnRate)}</div>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {config.description}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  MFクラウド連携
                </span>
                {lastFetchedAt && <span>最終取得: {lastFetchedAt}</span>}
              </div>
              {(runwayData.alertLevel === "CRITICAL" ||
                runwayData.alertLevel === "WARNING" ||
                runwayData.alertLevel === "CAUTION") && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <ActionizeButton
                    sourceScreen="CASHFLOW"
                    sourceRef={{
                      alertLevel: runwayData.alertLevel,
                      runwayMonths: runwayData.months,
                      kind: "runway",
                    }}
                    defaultTitle={`資金繰りリスク対応（ランウェイ${runwayData.months.toFixed(1)}か月）`}
                    defaultDescription={`ランウェイ警戒レベル: ${config.label}。現預金${formatManYen(runwayData.cashBalance)} / 月次バーンレート${formatManYen(runwayData.monthlyBurnRate)}。対応策（入金前倒し・支出繰延・融資）を検討。`}
                    defaultSeverity={
                      runwayData.alertLevel === "CRITICAL"
                        ? "CRITICAL"
                        : runwayData.alertLevel === "WARNING"
                          ? "HIGH"
                          : "MEDIUM"
                    }
                    defaultOwnerRole="EXECUTIVE"
                    size="sm"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!mfNotConnected && !isError && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                  月次資金繰り表
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                ) : (
                  <CashflowTable
                    months={mfCashflow.data?.months}
                    rows={mfCashflow.data?.rows}
                    certaintyLevels={certaintyLevels}
                  />
                )}
              </CardContent>
            </Card>

            <CashflowChart
              months={mfCashflow.data?.months}
              cashBalances={mfCashflow.data?.cashBalances}
            />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
