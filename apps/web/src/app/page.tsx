"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, AlertTriangle, AlertCircle, Info, Zap, Users, ChevronRight, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentBanner } from "@/components/agent/agent-banner";
import { AGENTS } from "@/lib/agent-voice";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { BriefingCard } from "@/components/dashboard/briefing-card";
import { AgentActivityCard } from "@/components/dashboard/agent-activity-card";
import { cn } from "@/lib/utils";
import {
  useMfDashboard,
  useMfPLTransition,
  useAiSummary,
  useAlerts,
  useMfOffice,
} from "@/hooks/use-mf-data";
import { PrintButton } from "@/components/ui/print-button";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { PeriodSegmentControl } from "@/components/ui/period-segment-control";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { api, isMfNotConnected } from "@/lib/api";
import { useCurrentOrg } from "@/contexts/current-org";
import { useAuthStore } from "@/lib/auth";
import type {
  DashboardSummary,
  AiSummaryHighlight,
  AiSummarySection,
  AlertItem,
  RunwayMode,
  RunwayAlertLevel,
} from "@/lib/mf-types";
import { RunwayModeToggle, useRunwayMode } from "@/components/ui/runway-mode-toggle";

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

/** 現在選択中のバーンレート種別を示すラベル */
const RUNWAY_MODE_LABEL: Record<RunwayMode, string> = {
  worstCase: "Gross Burn",
  netBurn: "Net Burn",
  actual: "Actual Burn",
};

function runwayTag(level: DashboardSummary["alertLevel"] | undefined, runway: number) {
  const normalized =
    level ??
    (runway >= 12 ? "SAFE" : runway >= 6 ? "CAUTION" : runway >= 3 ? "WARNING" : "CRITICAL");
  switch (normalized) {
    case "SAFE":
      return { label: "安全", className: "bg-[#e8f5e9] text-[var(--color-success)]" };
    case "CAUTION":
      return { label: "注意", className: "bg-[#fff8e1] text-[#8d6e00]" };
    case "WARNING":
      return { label: "警告", className: "bg-[#fff0e6] text-[#c85a00]" };
    case "CRITICAL":
    default:
      return { label: "危険", className: "bg-[#fce4ec] text-[var(--color-error)]" };
  }
}

/** 前年同月比（YoY）を % で。前年データが 0 や undefined なら null */
function yoy(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous === 0 || !Number.isFinite(previous)) return undefined;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function buildKpis(data: DashboardSummary, runwayMode: RunwayMode) {
  const revenue = data.revenue ?? 0;
  const opProfit = data.operatingProfit ?? 0;
  const cashBalance = data.cashBalance ?? 0;
  const variant = data.runwayVariants?.[runwayMode];
  const runway = variant?.months ?? data.runway ?? 0;
  const runwayAlert: RunwayAlertLevel | undefined = variant?.alertLevel ?? data.alertLevel;
  const opMargin = revenue > 0 ? Math.round((opProfit / revenue) * 1000) / 10 : 0;

  const prev = data.prevYear;
  const prevRevenue = prev?.revenue;
  const prevOpProfit = prev?.operatingProfit;
  const prevCash = prev?.cashBalance;
  const prevOpMargin =
    prev && prev.revenue > 0
      ? Math.round((prev.operatingProfit / prev.revenue) * 1000) / 10
      : undefined;

  const judge = (good: boolean) =>
    good
      ? { label: "良好", className: "bg-[#e8f5e9] text-[var(--color-success)]" }
      : { label: "要注意", className: "bg-[#fff8e1] text-[#8d6e00]" };

  return [
    {
      title: "売上高",
      value: Math.round(revenue / 10000),
      unit: "万円",
      tag: judge(revenue > 0),
      comparisonLabel: "前年同月比",
      comparisonValue: yoy(revenue, prevRevenue),
      help: {
        formula: "当期月次売上高（PL「売上高合計」）",
        meaning: "事業の売上水準。再現性のある売上か（一時案件か継続か）の確認とセットで読む",
        benchmark: "前年同月比で増収していれば成長、減収なら減速要因の特定が必要",
      },
    },
    {
      title: "営業利益",
      value: Math.round(opProfit / 10000),
      unit: "万円",
      tag: judge(opProfit > 0),
      comparisonLabel: "前年同月比",
      comparisonValue: yoy(opProfit, prevOpProfit),
      help: {
        formula: "売上高 − 売上原価 − 販管費",
        meaning: "本業で稼ぐ力。固定費を売上で吸収できているかの最重要指標",
        benchmark: "黒字が継続していれば本業が自立。赤字幅が縮小していれば改善方向",
      },
    },
    {
      title: "営業利益率",
      value: opMargin,
      unit: "%",
      tag: judge(opMargin >= 10),
      comparisonLabel: "前年同月比",
      comparisonValue:
        prevOpMargin !== undefined ? Math.round((opMargin - prevOpMargin) * 10) / 10 : undefined,
      help: {
        formula: "営業利益 ÷ 売上高 × 100",
        meaning: "売上 1 円あたりの本業利益。事業構造の効率を示す",
        benchmark: "中小企業で 10% 超なら良好。5% 未満は固定費が重い兆候",
      },
    },
    {
      title: "現預金残高",
      value: Math.round(cashBalance / 10000),
      unit: "万円",
      tag: judge(cashBalance > 0),
      comparisonLabel: "前年同期比",
      comparisonValue: yoy(cashBalance, prevCash),
      help: {
        formula: "BS「現金及び預金」月末残高",
        meaning: "今この瞬間の支払い余力。これとバーンの組み合わせがランウェイ",
        benchmark: "月次バーン × 6 ヶ月以上が一般的な目安",
      },
    },
    {
      title: "ランウェイ",
      value: runway >= 999 ? "∞" : runway,
      unit: runway >= 999 ? "" : "か月",
      tag: runwayTag(runwayAlert, runway),
      help: {
        formula: "現預金残高 ÷ 月次バーン（選択モード基準）",
        meaning: "今のキャッシュ水準で何ヶ月持つか。資金調達タイミングの判断軸",
        benchmark: "12ヶ月以上=安全 / 6ヶ月未満=要対応 / 3ヶ月未満=危険",
        caveat: "Net Burn / Actual Burn / Gross Burn でモードを切替可能。乖離が大きい時は構造的体力 (Net Burn) も併せて確認",
      },
      activeMode: runwayMode,
    },
  ];
}

export default function DashboardPage() {
  const dashboard = useMfDashboard();
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const { currentOrgId, memberships, isLoading: membershipsLoading, hasMemberships } = useCurrentOrg();
  const orgId = currentOrgId ?? "";
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  // 顧問先 0 件の事務所スタッフ (owner / advisor) はダッシュボードを開いても何も見るものがないため、
  // /advisor (顧問先一覧 + 新規追加 CTA) に誘導する。
  // memberships 取得待ちの間は判定保留 (isLoading 中は redirect しない)。
  useEffect(() => {
    if (membershipsLoading) return;
    if (!user) return;
    const isInternalStaff = user.role === "owner" || user.role === "advisor";
    if (isInternalStaff && !hasMemberships) {
      router.replace("/advisor");
    }
  }, [membershipsLoading, user, hasMemberships, router]);

  // memberships 未解決のあいだは描画を抑止（チラつき / 不要な MF query を防ぐ）
  void memberships;

  const isLoading = dashboard.isLoading;
  const mfNotConnected = isMfNotConnected(dashboard.error);
  const isError = dashboard.isError && !mfNotConnected;
  // KPI を最優先で表示するため、二次クエリは dashboard 取得完了後に発火する。
  // 旧実装は !mfNotConnected && !isError だけだったので初回ロードで MF 系すべて
  // (dashboard / PL / AI / alerts / triage / actions) が同時発火し、
  // alerts/triage の中で MF を再取得する構造と相まって rate-limit backoff に
  // 突入しページ全体が重くなっていた。
  const canQueryDependents = !!dashboard.data && !mfNotConnected && !isError;
  const [runwayMode, setRunwayMode] = useRunwayMode();

  // AI コール（aiSummary / Briefing）はコストが重いので明示的なボタン押下時だけ発火する。
  // KPI / グラフ / アラート / トリアージ等は自動継続。AI 経営分析を売上推移の直下に配置。
  const [aiTriggered, setAiTriggered] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(true);

  const plTransition = useMfPLTransition({ enabled: canQueryDependents });
  const aiSummaryQuery = useAiSummary({ enabled: canQueryDependents && aiTriggered });
  const alertsQuery = useAlerts({ enabled: canQueryDependents });

  const actionsSummary = useQuery({
    queryKey: ["actions-summary", orgId],
    queryFn: () => api.actions.summary(orgId),
    enabled: !!orgId && canQueryDependents,
    staleTime: 60_000,
  });

  const triageQuery = useQuery({
    queryKey: ["triage-classify", orgId],
    queryFn: () => api.triage.classify(orgId),
    enabled: !!orgId && canQueryDependents,
    staleTime: 60_000,
  });

  const kpis = dashboard.data ? buildKpis(dashboard.data, runwayMode) : null;

  const periodLabel = getPeriodLabel(fiscalYear, month, periods);

  const hasNoData = !isLoading && (mfNotConnected || (!dashboard.isError && !dashboard.data));

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">経営ダッシュボード</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        <div className="flex items-center justify-between screen-only">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              ダッシュボード
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {periodLabel} 経営サマリー
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">ランウェイ</span>
              <RunwayModeToggle mode={runwayMode} onChange={setRunwayMode} />
            </div>
            <PrintButton />
          </div>
        </div>

        <PeriodSegmentControl />

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {kpis.map((kpi) => {
              // ランウェイカードは縦長になるのを避けつつ、現在のバーンレート種別だけ
              // 1 行で示す。全 variants 併記は撤去（他カードと高さ揃える）。
              const isRunway = kpi.title === "ランウェイ";
              const activeMode = isRunway
                ? (kpi as { activeMode?: RunwayMode }).activeMode
                : undefined;
              const subContent = isRunway ? (
                <div className="text-[10px] text-muted-foreground">
                  基準:{" "}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {RUNWAY_MODE_LABEL[activeMode ?? "netBurn"]}
                  </span>
                </div>
              ) : undefined;
              return (
                <KpiCard
                  key={kpi.title}
                  title={kpi.title}
                  value={kpi.value}
                  unit={kpi.unit}
                  tag={kpi.tag}
                  comparisonLabel={kpi.comparisonLabel}
                  comparisonValue={kpi.comparisonValue}
                  help={kpi.help}
                  subContent={subContent}
                />
              );
            })}
          </div>
        ) : null}

        {canQueryDependents && <RevenueChart mfData={plTransition.data} />}

        {/* AI 分析セクション。重いコール（aiSummary / Briefing）は自動 fetch せず、
            ユーザーが明示的にボタンを押した時だけ発火する。
            ユーザー指示で売上高月次推移の直下に配置（旧:ページ末尾）。 */}
        {canQueryDependents && !aiTriggered && (
          <Card className="border-dashed border-[var(--color-secondary)]/40 bg-gradient-to-br from-[#ede7f6]/30 via-white to-white">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <Sparkles className="h-8 w-8 text-[var(--color-secondary)]" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  AI 経営分析
                </p>
                <p className="text-xs text-muted-foreground">
                  今期の業績データから AI が朝サマリーと経営コメンタリーを生成します（数秒〜十数秒かかります）。
                </p>
              </div>
              <Button
                onClick={() => setAiTriggered(true)}
                className="bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary)]/90"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                AI 分析を実行
              </Button>
            </CardContent>
          </Card>
        )}

        {canQueryDependents && aiTriggered && (
          <div className="screen-only space-y-6">
            <BriefingCard enabled={canQueryDependents} />
          </div>
        )}

        {canQueryDependents && aiTriggered && (
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
                        {aiSummaryQuery.data.sections.map((s: AiSummarySection, i: number) => (
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
                        {aiSummaryQuery.data.highlights.map((h: AiSummaryHighlight, i: number) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className={cn(
                              "px-2 py-0.5 text-[10px]",
                              h.type === "positive" &&
                                "border-green-300 bg-green-100 text-green-700",
                              h.type === "negative" &&
                                "border-red-300 bg-red-100 text-red-700",
                              h.type === "warning" &&
                                "border-yellow-300 bg-yellow-100 text-yellow-800",
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
        )}

        {/* Action / Triage は AI 経営分析とアラートの間に配置（ユーザー指示） */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ActionSummaryCard summary={actionsSummary.data} isLoading={actionsSummary.isLoading} />
          <TriageSummaryCard
            summary={triageQuery.data?.summary}
            signals={triageQuery.data?.signals}
            isLoading={triageQuery.isLoading}
          />
        </div>

        {/* アラート（折りたたみ可能。デフォルト展開、件数バッジ付き） */}
        {canQueryDependents && (
          <Card>
            <CardHeader className="pb-2">
              <button
                type="button"
                onClick={() => setAlertsOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={alertsOpen}
                aria-controls="alerts-panel"
              >
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                  アラート
                  {alertsQuery.data && alertsQuery.data.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-[#fce4ec] px-1.5 py-0 text-[10px] text-[var(--color-error)]"
                    >
                      {alertsQuery.data.length}件
                    </Badge>
                  )}
                </CardTitle>
                {alertsOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {alertsOpen && (
              <CardContent id="alerts-panel" className="space-y-3">
                {alertsQuery.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                    ))}
                  </div>
                ) : alertsQuery.data && alertsQuery.data.length > 0 ? (
                  alertsQuery.data.map((alert: AlertItem) => {
                    const level = alert.level || alert.severity || "info";
                    const config = alertLevelConfig[level as keyof typeof alertLevelConfig] || alertLevelConfig.info;
                    const Icon = config.icon;
                    const severityMap: Record<string, "CRITICAL" | "HIGH" | "MEDIUM"> = {
                      critical: "CRITICAL",
                      warning: "HIGH",
                      info: "MEDIUM",
                    };
                    const defaultSeverity = severityMap[level] ?? "MEDIUM";

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
                        <div className="flex shrink-0 items-center gap-2">
                          <ActionizeButton
                            sourceScreen="ALERTS"
                            sourceRef={{ alertId: alert.id, level }}
                            defaultTitle={alert.title}
                            defaultDescription={alert.description || alert.message}
                            defaultSeverity={defaultSeverity}
                            defaultOwnerRole="ADVISOR"
                            size="sm"
                          />
                          <span className="text-xs text-muted-foreground">
                            {alert.date || alert.createdAt?.slice(0, 10)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    アラートはありません
                  </p>
                )}
              </CardContent>
            )}
          </Card>
        )}

        <div className="screen-only space-y-6">
          <AgentBanner
            agent={AGENTS.brief}
            status={alertsQuery.data && alertsQuery.data.length > 0 ? "alert" : "ok"}
            detectionCount={alertsQuery.data?.length ?? 0}
            lastUpdatedAt={new Date().toISOString()}
            actions={
              <CopilotOpenButton
                agentKey="brief"
                mode="observe"
                seed="今朝の注目点を3点に絞って整理してください。"
              />
            }
          />

          <AgentActivityCard enabled={canQueryDependents} />
        </div>
      </div>
    </DashboardShell>
  );
}

function ActionSummaryCard({
  summary,
  isLoading,
}: {
  summary?: { total: number; notStarted: number; inProgress: number; overdue: number };
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <Zap className="h-5 w-5 text-[var(--color-tertiary)]" />
          Actionサマリー
        </CardTitle>
        <Link
          href="/actions"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[var(--color-primary)]"
        >
          詳細 <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded bg-muted" />
        ) : !summary || summary.total === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">オープンなActionはありません</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/20 p-3 text-center">
              <div className="text-2xl font-bold text-[var(--color-text-primary)]">
                {summary.total}
              </div>
              <div className="text-[10px] text-muted-foreground">合計</div>
            </div>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center">
              <div className="text-2xl font-bold text-yellow-700">{summary.inProgress}</div>
              <div className="text-[10px] text-yellow-600">対応中</div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{summary.overdue}</div>
              <div className="text-[10px] text-red-600">期限超過</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TriageSummaryCard({
  summary,
  signals,
  isLoading,
}: {
  summary?: { urgent: number; thisWeek: number; monthly: number; noise: number; total: number };
  signals?: Array<{ id: string; title: string; bucket: string; severity: string; linkHref?: string }>;
  isLoading: boolean;
}) {
  const urgentTop3 = (signals || []).filter((s) => s.bucket === "URGENT").slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <Users className="h-5 w-5 text-[var(--color-secondary)]" />
          AIトリアージ
        </CardTitle>
        <Link
          href="/triage"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[var(--color-primary)]"
        >
          詳細 <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded bg-muted" />
        ) : !summary || summary.total === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">シグナルはありません</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-center">
                <div className="text-lg font-bold text-red-700">{summary.urgent}</div>
                <div className="text-[10px] text-red-600">緊急</div>
              </div>
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-2 text-center">
                <div className="text-lg font-bold text-yellow-700">{summary.thisWeek}</div>
                <div className="text-[10px] text-yellow-600">今週</div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-center">
                <div className="text-lg font-bold text-blue-700">{summary.monthly}</div>
                <div className="text-[10px] text-blue-600">月次</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2 text-center">
                <div className="text-lg font-bold text-muted-foreground">{summary.noise}</div>
                <div className="text-[10px] text-muted-foreground">ノイズ</div>
              </div>
            </div>
            {urgentTop3.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] font-semibold text-red-600">緊急Top3</div>
                {urgentTop3.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded border border-red-100 bg-red-50/40 px-2 py-1.5"
                  >
                    <AlertCircle className="h-3 w-3 shrink-0 text-red-600" />
                    <span className="flex-1 truncate text-xs">{s.title}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
