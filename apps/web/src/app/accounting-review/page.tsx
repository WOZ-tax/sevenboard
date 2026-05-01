"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { PeriodSegmentControl } from "@/components/ui/period-segment-control";
import { useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodDefaultFromKintone } from "@/hooks/use-kintone-progress";
import {
  ClipboardCheck,
  FileText,
  AlertTriangle,
  ChevronRight,
  Play,
  Loader2,
  Printer,
} from "lucide-react";
import { AgentBanner } from "@/components/agent/agent-banner";
import { AGENTS } from "@/lib/agent-voice";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type {
  KintoneMonthlyProgress,
  ReviewAlert,
  ReviewBsRatio,
  ReviewCrossFinding,
  ReviewJournalDuplicate,
  ReviewJournalPersonal,
  ReviewPlMonthlyRow,
  ReviewPlSgaBreakdown,
  ReviewTaxInv80Entry,
  ReviewTaxMismatch,
} from "@/lib/mf-types";

type TabKey = "checklist" | "review";

const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "review", label: "経理レビュー", icon: AlertTriangle },
  { key: "checklist", label: "チェックリスト", icon: ClipboardCheck },
];

const STATUS_STEPS = [
  { value: "0.未作業", label: "未作業", color: "bg-gray-200 text-gray-700" },
  { value: "1.資料依頼済", label: "資料依頼済", color: "bg-yellow-100 text-yellow-800" },
  { value: "2.資料回収済", label: "資料回収済", color: "bg-blue-100 text-blue-800" },
  { value: "3.入力済", label: "入力済", color: "bg-indigo-100 text-indigo-800" },
  { value: "4.納品済", label: "納品済", color: "bg-green-100 text-green-800" },
  { value: "5.実施不要", label: "実施不要", color: "bg-gray-100 text-gray-500" },
];

function getStatusBadge(status: string) {
  const step = STATUS_STEPS.find((s) => s.value === status) || STATUS_STEPS[0];
  return step;
}

function getNextStatus(current: string): string | null {
  const idx = STATUS_STEPS.findIndex((s) => s.value === current);
  if (idx < 0 || idx >= 3) return null; // 入力済以降は手動で進めない
  return STATUS_STEPS[idx + 1].value;
}

export default function AccountingReviewPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("review");
  const orgId = useScopedOrgId();
  // kintone 月次進捗の「納品済」最新月を期間デフォルトに自動適用 (旧 DashboardShell から移設)
  usePeriodDefaultFromKintone();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const queryClient = useQueryClient();

  const office = useMfOffice();

  // kintone月次進捗をMF事業者番号で取得
  const mfCode = office.data?.code || "";
  const fy = fiscalYear?.toString() || new Date().getFullYear().toString();
  const kintoneProgress = useQuery({
    queryKey: ["kintone", "progress", mfCode, fy],
    queryFn: () => api.kintone.getByMfCode(mfCode, fy),
    enabled: !!mfCode,
    staleTime: 60 * 1000,
  });

  const updateStatus = useMutation({
    mutationFn: (params: { recordId: string; month: number; status: string }) =>
      api.kintone.updateStatus(params.recordId, params.month, params.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kintone", "progress"] });
    },
  });

  // 現在の月のステータス
  const currentMonth = month || new Date().getMonth() + 1;
  const currentStatus = kintoneProgress.data?.monthlyStatus?.[currentMonth] || "0.未作業";
  const statusInfo = getStatusBadge(currentStatus);

  // SevenBoard MonthlyClose ステータス
  const monthlyClosesQuery = useQuery({
    queryKey: ["monthly-close", "list", orgId, fiscalYear ?? null],
    queryFn: () => api.monthlyClose.list(orgId, fiscalYear as number),
    enabled: !!orgId && !!fiscalYear,
    staleTime: 60 * 1000,
  });
  const currentClose = monthlyClosesQuery.data?.find((c) => c.month === currentMonth);
  const currentCloseStatus = currentClose?.status ?? "OPEN";

  const setCloseStatus = useMutation({
    mutationFn: (next: "OPEN" | "IN_REVIEW" | "CLOSED") =>
      api.monthlyClose.setStatus(orgId, fiscalYear as number, currentMonth, next),
    onSuccess: () => {
      // 一覧 + デフォルト月解決の両方を更新
      queryClient.invalidateQueries({ queryKey: ["monthly-close"] });
    },
  });

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-[1200px] space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">会計レビュー報告書</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-3 screen-only">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              会計レビュー
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {office.data?.name || "—"} — {periodLabel}
              </p>
              {/* SevenBoard 月次締めステータス（社名・期間の右隣に配置） */}
              <div className="flex items-center gap-1.5">
                <select
                  value={currentCloseStatus}
                  onChange={(e) =>
                    setCloseStatus.mutate(
                      e.target.value as "OPEN" | "IN_REVIEW" | "CLOSED",
                    )
                  }
                  disabled={setCloseStatus.isPending || !orgId || !fiscalYear}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  aria-label={`${currentMonth}月の月次締めステータス`}
                >
                  <option value="OPEN">未完了</option>
                  <option value="IN_REVIEW">レビュー中</option>
                  <option value="CLOSED">完了</option>
                </select>
                {setCloseStatus.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
              {/* kintone進捗（連携時のみ） */}
              {kintoneProgress.data && (
                <div className="flex items-center gap-1.5 border-l pl-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    kintone
                  </span>
                  <Badge className={cn("border text-xs", statusInfo.color)}>
                    {statusInfo.label}
                  </Badge>
                  {getNextStatus(currentStatus) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 text-[11px]"
                      disabled={updateStatus.isPending}
                      onClick={() => {
                        const next = getNextStatus(currentStatus);
                        if (next && kintoneProgress.data) {
                          updateStatus.mutate({
                            recordId: kintoneProgress.data.recordId,
                            month: currentMonth,
                            status: next,
                          });
                        }
                      }}
                    >
                      次へ
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs shrink-0"
            onClick={() => window.print()}
            aria-label="このタブをPDFとして出力"
          >
            <Printer className="h-3 w-3" />
            PDF出力
          </Button>
        </div>

        <PeriodSegmentControl showAllPeriod={false} label="対象月（単月）" highlightRange={false} />

        <div className="screen-only">
          <AgentBanner
            agent={AGENTS.auditor}
            status={
              currentStatus === "4.納品済"
                ? "ok"
                : currentStatus === "0.未作業"
                  ? "idle"
                  : "running"
            }
            detectionCount={0}
            lastUpdatedAt={new Date().toISOString()}
            actions={
              <CopilotOpenButton
                agentKey="auditor"
                mode="observe"
                seed="今月のレビュー網羅性と、再発している指摘の傾向を整理してください。"
              />
            }
          />
        </div>

        {/* ① 健康サマリー (AI CFO の経営健康モニター) */}
        <HealthSummaryCard orgId={orgId} fiscalYear={fiscalYear} month={month} />

        {/* ② 要確認アイテム (AI CFO の異常検知) */}
        <RiskFindingsCard orgId={orgId} fiscalYear={fiscalYear} month={month} />

        {/* タブ */}
        <div
          role="tablist"
          aria-label="会計レビューの表示セクション"
          className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                id={`monthly-tab-${tab.key}`}
                aria-selected={selected}
                aria-controls={`monthly-panel-${tab.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                    : "border-transparent text-muted-foreground hover:text-[var(--color-text-primary)]"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* タブコンテンツ */}
        {activeTab === "checklist" && (
          <div role="tabpanel" id="monthly-panel-checklist" aria-labelledby="monthly-tab-checklist">
            <ChecklistTab
              progress={kintoneProgress.data}
              isLoading={kintoneProgress.isLoading}
              onUpdateStatus={(m, status) => {
                if (kintoneProgress.data) {
                  updateStatus.mutate({
                    recordId: kintoneProgress.data.recordId,
                    month: m,
                    status,
                  });
                }
              }}
            />
          </div>
        )}

        {activeTab === "review" && (
          <div role="tabpanel" id="monthly-panel-review" aria-labelledby="monthly-tab-review">
            <ReviewTab
              orgId={orgId}
              fiscalYear={fiscalYear}
              month={month}
            />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

/**
 * 健康スコア 8 指標の表示用メタデータ。
 * health-score-calculator.ts のロジックに合わせて、満点条件をユーザー向けに翻訳する。
 */
const HEALTH_SCORE_DETAIL_META: Array<{
  group: "activity" | "safety" | "efficiency";
  groupLabel: string;
  detailKey: keyof import("@/lib/api").HealthScoreBreakdownDetail;
  indicatorKey: keyof import("@/lib/api").HealthFinancialIndicators;
  label: string;
  max: number;
  hint: string;
  format: (v: number) => string;
}> = [
  {
    group: "activity",
    groupLabel: "活動性 (収益性)",
    detailKey: "operatingProfitMargin",
    indicatorKey: "operatingProfitMargin",
    label: "営業利益率",
    max: 15,
    hint: "10% 以上で満点。中小企業は 5% で標準",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    group: "activity",
    groupLabel: "活動性 (収益性)",
    detailKey: "roe",
    indicatorKey: "roe",
    label: "ROE (自己資本利益率)",
    max: 15,
    hint: "15% 以上で満点。投資家評価の目安",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    group: "activity",
    groupLabel: "活動性 (収益性)",
    detailKey: "roa",
    indicatorKey: "roa",
    label: "ROA (総資産利益率)",
    max: 10,
    hint: "5% 以上で満点。資産効率の目安",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    group: "safety",
    groupLabel: "安全性 (財務体質)",
    detailKey: "currentRatio",
    indicatorKey: "currentRatio",
    label: "流動比率",
    max: 15,
    hint: "200% 以上で満点。100% を割ると短期支払不安",
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    group: "safety",
    groupLabel: "安全性 (財務体質)",
    detailKey: "equityRatio",
    indicatorKey: "equityRatio",
    label: "自己資本比率",
    max: 15,
    hint: "50% 以上で満点。20% で銀行評価の標準",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    group: "safety",
    groupLabel: "安全性 (財務体質)",
    detailKey: "debtCoverage",
    indicatorKey: "debtEquityRatio",
    label: "負債比率 (低いほど良い)",
    max: 10,
    hint: "100% (負債=純資産) 以下で満点。300% 超で要警戒",
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    group: "efficiency",
    groupLabel: "効率性 (資産活用)",
    detailKey: "totalAssetTurnover",
    indicatorKey: "totalAssetTurnover",
    label: "総資産回転率",
    max: 10,
    hint: "1.5 回 以上で満点。資産が売上を生む効率",
    format: (v) => `${v.toFixed(2)} 回`,
  },
  {
    group: "efficiency",
    groupLabel: "効率性 (資産活用)",
    detailKey: "receivablesTurnover",
    indicatorKey: "receivablesTurnover",
    label: "売上債権回転率",
    max: 10,
    hint: "12 回 以上で満点 (回収サイト 1 ヶ月相当)",
    format: (v) => `${v.toFixed(1)} 回`,
  },
];

/**
 * ① 健康サマリー (AI CFO の経営健康モニター) カード。
 *
 * - スコア (0-100) と前月比
 * - breakdown (活動性 40 / 安全性 40 / 効率性 20)
 * - 「内訳を見る」で 8 指標 × 値・スコア・満点条件 を展開
 * - AI 質問 5 問 (生成中は ThinkingIndicator)
 * - 「健康再計算」ボタン (任意で AI 質問を再生成)
 */
function HealthSummaryCard({
  orgId,
  fiscalYear,
  month,
}: {
  orgId: string;
  fiscalYear?: number;
  month?: number;
}) {
  const queryClient = useQueryClient();
  const enabled = !!orgId && !!fiscalYear && !!month;

  const snapshotQuery = useQuery({
    queryKey: ["health-snapshot", orgId, fiscalYear, month],
    queryFn: () => api.healthSnapshot.byMonth(orgId, fiscalYear!, month!),
    enabled,
    staleTime: 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: (generateAiQuestions: boolean) =>
      api.healthSnapshot.refresh(orgId, fiscalYear!, month!, generateAiQuestions),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["health-snapshot", orgId, fiscalYear, month],
      });
    },
  });

  if (!enabled) return null;

  const data = snapshotQuery.data;
  const delta =
    data && data.prevScore !== null ? data.score - data.prevScore : null;
  const isGeneratingAi =
    refreshMutation.isPending && refreshMutation.variables === true;

  return (
    <Card className="screen-only">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
          健康サマリー
          {data && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {data.snapshotDate}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate(false)}
            title="MF データから健康スコアを再計算 (コストゼロ)"
          >
            {refreshMutation.isPending && refreshMutation.variables === false ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="ml-1">健康再計算</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate(true)}
            title="AI が今月の論点 5 問を生成 (LLM トークン消費)"
          >
            {refreshMutation.isPending && refreshMutation.variables === true ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="ml-1">AI 質問生成</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {snapshotQuery.isLoading ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : !data ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            この月の健康スナップショットはまだありません。
            <br />
            <span className="text-xs">
              MF を再同期するか、「健康再計算」ボタンで生成してください。
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 上段: 左 (スコア + 3バー縦積み) | 右 (レーダー) */}
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {/* 左カラム: スコアカード + 3 バー縦積み */}
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center rounded-md border bg-muted/10 px-6 py-5">
                  <div className="text-xs font-medium text-muted-foreground">
                    健康スコア
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-7xl font-bold tabular-nums leading-none",
                        data.score >= 75
                          ? "text-[var(--color-success)]"
                          : data.score >= 50
                            ? "text-amber-600"
                            : "text-red-600",
                      )}
                    >
                      {data.score}
                    </span>
                    <span className="text-lg text-muted-foreground">/100</span>
                  </div>
                  {delta !== null && (
                    <span
                      className={cn(
                        "mt-2 text-sm font-medium",
                        delta > 0
                          ? "text-[var(--color-success)]"
                          : delta < 0
                            ? "text-red-600"
                            : "text-muted-foreground",
                      )}
                    >
                      {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}
                      前月比 {delta > 0 ? "+" : ""}
                      {delta} pt
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  <BreakdownBar
                    label="活動性"
                    sublabel="収益性"
                    value={data.breakdown.activity}
                    max={40}
                    color="bg-emerald-500"
                  />
                  <BreakdownBar
                    label="安全性"
                    sublabel="財務体質"
                    value={data.breakdown.safety}
                    max={40}
                    color="bg-blue-500"
                  />
                  <BreakdownBar
                    label="効率性"
                    sublabel="資産活用"
                    value={data.breakdown.efficiency}
                    max={20}
                    color="bg-purple-500"
                  />
                </div>
              </div>

              {/* 右カラム: 8 軸レーダーチャート */}
              <div className="rounded-md border bg-muted/10 p-3">
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                  バランス図 (各指標の達成度 %)
                </div>
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      data={HEALTH_SCORE_DETAIL_META.map((meta) => {
                        const score =
                          data.breakdown.detail[meta.detailKey] ?? 0;
                        return {
                          axis: meta.label.replace(/\s.*$/, ""),
                          value: Math.max(0, Math.min(100, (score / meta.max) * 100)),
                        };
                      })}
                      outerRadius="78%"
                    >
                      <PolarGrid stroke="var(--color-border)" />
                      <PolarAngleAxis
                        dataKey="axis"
                        tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={false}
                        axisLine={false}
                      />
                      <Radar
                        name="達成度"
                        dataKey="value"
                        stroke="var(--color-primary)"
                        fill="var(--color-primary)"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 下段: 8 指標の値・スコア・ヒント (フル幅、3 列で並べる) */}
            <div className="rounded-md border bg-muted/10 p-4">
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                スコアの根拠 (8 指標の内訳)
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {(["activity", "safety", "efficiency"] as const).map(
                  (group) => {
                    const items = HEALTH_SCORE_DETAIL_META.filter(
                      (m) => m.group === group,
                    );
                    const groupLabel = items[0]?.groupLabel ?? "";
                    return (
                      <div key={group}>
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {groupLabel}
                        </div>
                        <div className="space-y-1.5">
                          {items.map((meta) => (
                            <ScoreDetailRow
                              key={meta.detailKey}
                              label={meta.label}
                              hint={meta.hint}
                              indicatorValue={meta.format(
                                data.indicators[meta.indicatorKey] ?? 0,
                              )}
                              score={data.breakdown.detail[meta.detailKey] ?? 0}
                              max={meta.max}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            {/* AI 質問 5 問 */}
            {isGeneratingAi ? (
              <ThinkingIndicator
                stages={[
                  "指標を取得中",
                  "業種特性を参照中",
                  "AI CFO が考察中",
                  "問いを整理中",
                ]}
              />
            ) : data.aiQuestions.length > 0 ? (
              <div className="rounded-md bg-[var(--color-primary)]/5 p-3">
                <div className="mb-1.5 text-xs font-medium text-[var(--color-text-primary)]">
                  AI CFO からの今月の論点
                </div>
                <ol className="space-y-1 text-xs text-[var(--color-text-primary)]">
                  {data.aiQuestions.map((q, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                AI 質問は未生成です。「AI 質問生成」ボタンで作成できます (LLM トークン消費あり、20-40 秒程度)。
              </div>
            )}
          </div>
        )}

        {refreshMutation.isError && (
          <p className="mt-2 text-xs text-red-600">
            再計算に失敗しました: {String(refreshMutation.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownBar({
  label,
  sublabel,
  value,
  max,
  color,
}: {
  label: string;
  sublabel?: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex-1">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">
          {label}
          {sublabel && (
            <span className="ml-1 text-[10px] text-muted-foreground/70">
              ({sublabel})
            </span>
          )}
        </span>
        <span className="text-xs font-medium tabular-nums">
          {value.toFixed(1)}
          <span className="text-muted-foreground">/{max}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * 健康スコアの 1 指標を 1 行で表示する内訳行 (レーダー右側のリスト用)。
 * label・実値・スコア・bar・ヒントをコンパクトに 2 行で。
 */
function ScoreDetailRow({
  label,
  hint,
  indicatorValue,
  score,
  max,
}: {
  label: string;
  hint: string;
  indicatorValue: string;
  score: number;
  max: number;
}) {
  const ratio = max > 0 ? score / max : 0;
  const scoreColor =
    ratio >= 0.75
      ? "text-emerald-600"
      : ratio >= 0.5
        ? "text-amber-600"
        : "text-red-600";
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[var(--color-text-primary)]">
          {label}
        </span>
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="font-medium tabular-nums">{indicatorValue}</span>
          <span
            className={cn(
              "min-w-[52px] text-right font-medium tabular-nums",
              scoreColor,
            )}
          >
            {score.toFixed(1)}
            <span className="text-muted-foreground/70">/{max}</span>
          </span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground/80">{hint}</div>
    </div>
  );
}

/**
 * ② 要確認アイテム (AI CFO の異常検知) カード。
 *
 * - L1+L2 検知は MF 同期完了時に自動で走るので、fiscalYear/month に紐づく結果を取得して表示
 * - L1 だけ手動再検証 (コストゼロ) と L3 「AI詳細チェック」(LLM 課金) が選べる
 * - status は OPEN + CONFIRMED を表示。DISMISSED / RESOLVED は履歴扱いで非表示
 */
function RiskFindingsCard({
  orgId,
  fiscalYear,
  month,
}: {
  orgId: string;
  fiscalYear?: number;
  month?: number;
}) {
  const queryClient = useQueryClient();
  const [layerFilter, setLayerFilter] = useState<
    "ALL" | "L1_RULE" | "L2_STATS" | "L3_LLM"
  >("ALL");

  const enabled = !!orgId && !!fiscalYear && !!month;
  const findingsQuery = useQuery({
    queryKey: ["risk-findings", orgId, fiscalYear, month],
    queryFn: () => api.riskFindings.list(orgId, fiscalYear!, month!),
    enabled,
    staleTime: 30 * 1000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "CONFIRMED" | "DISMISSED" | "RESOLVED" }) =>
      api.riskFindings.updateStatus(orgId, vars.id, vars.status),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["risk-findings", orgId, fiscalYear, month],
      });
    },
  });

  const rescanMutation = useMutation({
    mutationFn: (layer: "L1" | "L3") =>
      api.riskFindings.runScan(orgId, fiscalYear!, month!, layer),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["risk-findings", orgId, fiscalYear, month],
      });
    },
  });

  if (!enabled) return null;

  const findings = findingsQuery.data ?? [];
  const filtered =
    layerFilter === "ALL"
      ? findings
      : findings.filter((f) => f.layer === layerFilter);

  const layerLabel: Record<"L1_RULE" | "L2_STATS" | "L3_LLM", string> = {
    L1_RULE: "L1 ルール",
    L2_STATS: "L2 統計",
    L3_LLM: "L3 AI",
  };

  return (
    <Card className="screen-only">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
          要確認アイテム
          {findings.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {findings.length} 件
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={rescanMutation.isPending}
            onClick={() => rescanMutation.mutate("L1")}
            title="MF データから決定的ルール (L1) を再実行 (コストゼロ)"
          >
            {rescanMutation.isPending && rescanMutation.variables === "L1" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="ml-1">再検証</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={rescanMutation.isPending}
            onClick={() => rescanMutation.mutate("L3")}
            title="LLM で摘要・パターンの意味的異常を検知 (トークン消費あり)"
          >
            {rescanMutation.isPending && rescanMutation.variables === "L3" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="ml-1">AI詳細チェック</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-1">
          {(["ALL", "L1_RULE", "L2_STATS", "L3_LLM"] as const).map((key) => {
            const selected = layerFilter === key;
            const label =
              key === "ALL" ? "全て" : layerLabel[key as keyof typeof layerLabel];
            return (
              <button
                key={key}
                onClick={() => setLayerFilter(key)}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
                  selected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "border-input text-muted-foreground hover:bg-muted/50",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {findingsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            要確認アイテムはありません。
            <br />
            <span className="text-xs">
              {findings.length === 0
                ? "MF 同期後に AI CFO が自動でチェックします。"
                : "選択中のフィルタに該当するアイテムがありません。"}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((f) => (
              <RiskFindingRow
                key={f.id}
                finding={f}
                onMarkConfirmed={() =>
                  updateStatusMutation.mutate({ id: f.id, status: "CONFIRMED" })
                }
                onMarkDismissed={() =>
                  updateStatusMutation.mutate({ id: f.id, status: "DISMISSED" })
                }
                onMarkResolved={() =>
                  updateStatusMutation.mutate({ id: f.id, status: "RESOLVED" })
                }
                isUpdating={updateStatusMutation.isPending}
              />
            ))}
          </div>
        )}

        {rescanMutation.isError && (
          <p className="mt-2 text-xs text-red-600">
            再検証に失敗しました: {String(rescanMutation.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RiskFindingRow({
  finding,
  onMarkConfirmed,
  onMarkDismissed,
  onMarkResolved,
  isUpdating,
}: {
  finding: import("@/lib/api").RiskFindingItem;
  onMarkConfirmed: () => void;
  onMarkDismissed: () => void;
  onMarkResolved: () => void;
  isUpdating: boolean;
}) {
  const layerColor: Record<string, string> = {
    L1_RULE: "bg-blue-100 text-blue-700 border-blue-300",
    L2_STATS: "bg-purple-100 text-purple-700 border-purple-300",
    L3_LLM: "bg-amber-100 text-amber-700 border-amber-300",
  };
  const layerLabel: Record<string, string> = {
    L1_RULE: "L1",
    L2_STATS: "L2",
    L3_LLM: "L3",
  };
  const scoreColor =
    finding.riskScore >= 80
      ? "bg-red-100 text-red-700 border-red-300"
      : finding.riskScore >= 60
        ? "bg-orange-100 text-orange-700 border-orange-300"
        : "bg-yellow-50 text-yellow-700 border-yellow-200";
  const isConfirmed = finding.status === "CONFIRMED";

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        isConfirmed ? "bg-muted/30 border-[var(--color-border)]" : "",
      )}
    >
      <div className="flex items-start gap-2">
        <Badge className={cn("border text-[10px]", scoreColor)}>
          ⚠ {finding.riskScore}
        </Badge>
        <Badge className={cn("border text-[10px]", layerColor[finding.layer])}>
          {layerLabel[finding.layer] ?? finding.layer}
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-text-primary)]">
            {finding.title}
          </div>
          <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
            {finding.body}
          </div>
          {finding.recommendedAction && (
            <div className="mt-1.5 rounded bg-[var(--color-primary)]/5 px-2 py-1 text-xs text-[var(--color-text-primary)]">
              <span className="font-medium">推奨: </span>
              {finding.recommendedAction}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-1.5">
        {!isConfirmed && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isUpdating}
            onClick={onMarkConfirmed}
            className="h-6 text-[10px] text-muted-foreground hover:text-[var(--color-text-primary)]"
          >
            確認済
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={isUpdating}
          onClick={onMarkDismissed}
          className="h-6 text-[10px] text-muted-foreground hover:text-[var(--color-text-primary)]"
        >
          対応不要
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isUpdating}
          onClick={onMarkResolved}
          className="h-6 text-[10px] text-[var(--color-success)] hover:bg-[var(--color-success)]/10"
        >
          対応完了
        </Button>
      </div>
    </div>
  );
}

function ChecklistTab({
  progress,
  isLoading,
  onUpdateStatus,
}: {
  progress: KintoneMonthlyProgress | undefined;
  isLoading: boolean;
  onUpdateStatus: (month: number, status: string) => void;
}) {
  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}</div>;
  }

  if (!progress) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          kintoneの月次進捗管理アプリと連携されていません。
          MF事業者番号がkintoneに登録されていることを確認してください。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>月次進捗チェックリスト</span>
          <span className="text-xs font-normal text-muted-foreground">
            担当: {progress.inCharge?.join(", ") || "—"} / レビュー: {progress.reviewer?.join(", ") || "—"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const status = progress.monthlyStatus[m] || "0.未作業";
            const info = getStatusBadge(status);
            const meetingDate = progress.meetingDates[m];
            const next = getNextStatus(status);

            return (
              <div
                key={m}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2",
                  status === "4.納品済" && "bg-green-50",
                  status === "5.実施不要" && "bg-gray-50 opacity-60",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 text-sm font-medium text-[var(--color-text-primary)]">{m}月</span>
                  <Badge className={cn("border text-[10px]", info.color)}>{info.label}</Badge>
                  {meetingDate && (
                    <span className="text-[10px] text-muted-foreground">面談: {meetingDate}</span>
                  )}
                </div>
                {next && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-[var(--color-primary)]"
                    onClick={() => onUpdateStatus(m, next)}
                  >
                    {getStatusBadge(next).label}へ
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

const SEVERITY_CONFIG = {
  HIGH: { label: "HIGH", color: "bg-red-100 text-red-800 border-red-300" },
  MEDIUM: { label: "MEDIUM", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  LOW: { label: "LOW", color: "bg-blue-100 text-blue-800 border-blue-300" },
};

function ReviewTab({
  orgId,
  fiscalYear,
  month,
}: {
  orgId: string;
  fiscalYear?: number;
  month?: number;
}) {
  const reviewQuery = useQuery({
    queryKey: ["review", orgId, fiscalYear, month],
    queryFn: () => api.review.run(orgId, fiscalYear, month),
    enabled: false,
    staleTime: 30 * 60 * 1000,
  });

  const [section, setSection] = useState<string>("summary");

  if (!reviewQuery.data && !reviewQuery.isFetching && !reviewQuery.isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">PL/BS/仕訳/消費税の定量チェックを実行します</p>
          <Button className="mt-4 gap-2 bg-[var(--color-primary)] text-white" onClick={() => reviewQuery.refetch()}>
            <Play className="h-4 w-4" />経理レビュー実行
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (reviewQuery.isError) {
    const err = reviewQuery.error as { statusCode?: number; message?: string } | null;
    const status = err?.statusCode;
    const isMfDisconnected = status === 503;
    const isAuth = status === 401 || status === 403;
    const title = isMfDisconnected
      ? "MFクラウド会計に接続されていません"
      : isAuth
        ? "権限がないか、セッションが切れています"
        : "レビュー実行に失敗しました";
    const hint = isMfDisconnected
      ? "設定 > 連携から MF 接続を完了してください"
      : isAuth
        ? "再ログインのうえお試しください"
        : err?.message || "時間をおいて再試行してください";
    return (
      <Card><CardContent className="py-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="text-sm font-semibold text-red-600">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        {!isMfDisconnected && !isAuth && (
          <Button className="mt-4" variant="outline" onClick={() => reviewQuery.refetch()}>再試行</Button>
        )}
      </CardContent></Card>
    );
  }

  if (reviewQuery.isFetching) {
    return (
      <Card><CardContent className="flex items-center justify-center gap-3 py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
        <span className="text-sm text-muted-foreground">分析実行中... PL/BS/仕訳/消費税を検証しています</span>
      </CardContent></Card>
    );
  }

  const d = reviewQuery.data;
  if (!d) return null;
  const { pl, bs, tax, journal, crossCheck, alerts, summary } = d;
  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();
  const sections = [
    { key: "summary", label: "サマリー" },
    { key: "pl", label: "P/L分析" },
    { key: "bs", label: "B/S分析" },
    { key: "tax", label: "消費税" },
    { key: "journal", label: "仕訳帳" },
    { key: "cross", label: "クロスチェック" },
    { key: "alerts", label: `指摘一覧(${alerts?.length || 0})` },
  ];

  return (
    <div className="space-y-4">
      {/* セクションナビ */}
      <div role="tablist" aria-label="経理レビューのセクション" className="flex gap-1 overflow-x-auto">
        {sections.map((s) => {
          const selected = section === s.key;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSection(s.key)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
                selected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                  : "border-input text-muted-foreground hover:bg-muted/50",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* サマリー */}
      {section === "summary" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{summary?.highCount}</div>
              <div className="text-[10px] text-red-600">HIGH</div>
            </div>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center">
              <div className="text-2xl font-bold text-yellow-700">{summary?.mediumCount}</div>
              <div className="text-[10px] text-yellow-600">MEDIUM</div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{summary?.lowCount}</div>
              <div className="text-[10px] text-blue-600">LOW</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-center">
              <div className="text-2xl font-bold">{summary?.totalAlerts}</div>
              <div className="text-[10px] text-muted-foreground">合計</div>
            </div>
          </div>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">PL計算検証</CardTitle></CardHeader>
            <CardContent><Badge className={pl?.all_ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>{pl?.all_ok ? "✓ 全項目一致" : "✗ 不一致あり"}</Badge></CardContent>
          </Card>
          {(pl?.interpretations || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">PL解釈</CardTitle></CardHeader>
              <CardContent className="space-y-1">{(pl.interpretations ?? []).map((t: string, i: number) => <p key={i} className="text-xs text-muted-foreground">{t}</p>)}</CardContent>
            </Card>
          )}
          {(bs?.stagnant_interpretations || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">滞留勘定</CardTitle></CardHeader>
              <CardContent className="space-y-1">{(bs.stagnant_interpretations ?? []).map((t: string, i: number) => <p key={i} className="text-xs text-muted-foreground">{t}</p>)}</CardContent>
            </Card>
          )}
          <div className="text-right text-xs text-muted-foreground">分析日時: {d.analyzedAt ? new Date(d.analyzedAt).toLocaleString("ja-JP") : "—"}</div>
        </div>
      )}

      {/* PL分析 */}
      {section === "pl" && (
        <div className="space-y-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">月次推移</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b">{["月", "売上高", "販管費", "販管費率", "営業利益", "経常利益", ""].map((h, idx) => <th key={idx} className="py-1.5 text-right font-semibold first:text-left">{h}</th>)}</tr></thead>
              <tbody>{(pl?.monthly_table || []).map((m: ReviewPlMonthlyRow, i: number) => (
                <tr key={i} className={cn("border-b", m.operating < 0 && "bg-red-50")}>
                  <td className="py-1.5 font-medium">{m.month}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(m.sales)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(m.sga)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.sga_ratio}%</td>
                  <td className={cn("py-1.5 text-right tabular-nums", m.operating < 0 && "text-red-600 font-bold")}>{fmt(m.operating)}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", m.ordinary < 0 && "text-red-600")}>{fmt(m.ordinary)}</td>
                  <td className="py-1.5 text-right">
                    {m.operating < 0 && (
                      <ActionizeButton
                        sourceScreen="MONTHLY_REVIEW"
                        sourceRef={{ month: m.month, kind: "pl-operating-negative" }}
                        defaultTitle={`${m.month} 営業赤字`}
                        defaultDescription={`${m.month}は営業利益 ${fmt(m.operating)}円。販管費率 ${m.sga_ratio}%、売上 ${fmt(m.sales)}円。要因分析と対策を検討`}
                        defaultSeverity="HIGH"
                        defaultOwnerRole="ADVISOR"
                        size="sm"
                      />
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table></div></CardContent>
          </Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">販管費構成 Top10</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b"><th className="py-1.5 text-left font-semibold">勘定科目</th><th className="py-1.5 text-right font-semibold">合計</th></tr></thead>
              <tbody>{(pl?.sga_breakdown || []).map((s: ReviewPlSgaBreakdown, i: number) => (
                <tr key={i} className="border-b"><td className="py-1.5">{s.account}</td><td className="py-1.5 text-right tabular-nums">{fmt(s.total)}</td></tr>
              ))}</tbody>
            </table></div></CardContent>
          </Card>
        </div>
      )}

      {/* BS分析 */}
      {section === "bs" && (
        <div className="space-y-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">財務比率推移</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b">{["月", "流動比率", "自己資本比率", ""].map((h, idx) => <th key={idx} className="py-1.5 text-right font-semibold first:text-left">{h}</th>)}</tr></thead>
              <tbody>{(bs?.ratios || []).map((r: ReviewBsRatio, i: number) => {
                const currentRisk = r.current_ratio < 100;
                const equityRisk = r.equity_ratio < 0;
                const risky = currentRisk || equityRisk;
                const issues: string[] = [];
                if (currentRisk) issues.push(`流動比率 ${r.current_ratio}%（短期支払能力に懸念）`);
                if (equityRisk) issues.push(`自己資本比率 ${r.equity_ratio}%（債務超過）`);
                return (
                  <tr key={i} className="border-b">
                    <td className="py-1.5 font-medium">{r.month}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", currentRisk && "text-red-600")}>{r.current_ratio}%</td>
                    <td className={cn("py-1.5 text-right tabular-nums", equityRisk && "text-red-600")}>{r.equity_ratio}%</td>
                    <td className="py-1.5 text-right">
                      {risky && (
                        <ActionizeButton
                          sourceScreen="MONTHLY_REVIEW"
                          sourceRef={{ month: r.month, kind: "bs-ratio-risk" }}
                          defaultTitle={`${r.month} 財務比率リスク`}
                          defaultDescription={issues.join(' / ')}
                          defaultSeverity={equityRisk ? "CRITICAL" : "HIGH"}
                          defaultOwnerRole="ADVISOR"
                          size="sm"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div></CardContent>
          </Card>
          {(bs?.negatives || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">マイナス残高 ({bs.negatives?.length ?? 0}件)</CardTitle>
                  <ActionizeButton
                    sourceScreen="MONTHLY_REVIEW"
                    sourceRef={{ kind: "bs-negative" }}
                    defaultTitle="BSマイナス残高の調査"
                    defaultDescription={(bs?.neg_interpretations ?? []).slice(0, 5).join(' / ') || "マイナス残高科目を洗い出し、原因仕訳を特定"}
                    defaultSeverity="HIGH"
                    defaultOwnerRole="ADVISOR"
                    size="sm"
                  />
                </div>
              </CardHeader>
              <CardContent><div className="space-y-1">{(bs?.neg_interpretations || []).map((t: string, i: number) => <p key={i} className="text-xs text-muted-foreground">{t}</p>)}</div></CardContent>
            </Card>
          )}
          {(bs?.stagnant || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">滞留勘定 ({bs.stagnant?.length ?? 0}件)</CardTitle>
                  <ActionizeButton
                    sourceScreen="MONTHLY_REVIEW"
                    sourceRef={{ kind: "bs-stagnant" }}
                    defaultTitle="滞留勘定の精査"
                    defaultDescription={(bs?.stagnant_interpretations ?? []).slice(0, 5).join(' / ') || "長期間動きのない勘定残高の実在性を確認"}
                    defaultSeverity="MEDIUM"
                    defaultOwnerRole="ADVISOR"
                    size="sm"
                  />
                </div>
              </CardHeader>
              <CardContent><div className="space-y-1">{(bs?.stagnant_interpretations || []).map((t: string, i: number) => <p key={i} className="text-xs text-muted-foreground">{t}</p>)}</div></CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 消費税 */}
      {section === "tax" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3"><div className="text-[10px] text-muted-foreground">税区分不整合</div><div className="text-lg font-bold">{tax?.mismatches?.length || 0}件</div></div>
            <div className="rounded-lg border p-3"><div className="text-[10px] text-muted-foreground">80%控除否認額</div><div className="text-lg font-bold">{fmt(tax?.inv_80_total_denied)}円</div></div>
            <div className="rounded-lg border p-3"><div className="text-[10px] text-muted-foreground">仮払消費税(推計)</div><div className="text-lg font-bold">{fmt(tax?.karibarai_est)}円</div></div>
          </div>
          {(tax?.mismatches || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">税区分不整合</CardTitle></CardHeader>
              <CardContent><div className="overflow-x-auto"><table className="w-full text-xs">
                <thead><tr className="border-b">{["日付", "No", "科目", "実際", "期待", "摘要"].map((h) => <th key={h} className="py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                <tbody>{(tax.mismatches ?? []).slice(0, 20).map((m: ReviewTaxMismatch, i: number) => (
                  <tr key={i} className="border-b"><td className="py-1">{m.date}</td><td className="py-1">{m.no}</td><td className="py-1">{m.account}</td><td className="py-1 text-red-600">{m.actual_tax}</td><td className="py-1 text-green-600">{m.expected_tax}</td><td className="py-1 text-muted-foreground truncate max-w-[200px]">{m.memo}</td></tr>
                ))}</tbody>
              </table></div></CardContent>
            </Card>
          )}
          {(tax?.inv_80_entries || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">インボイス80%控除 ({tax.inv_80_entries?.length ?? 0}件)</CardTitle></CardHeader>
              <CardContent><div className="overflow-x-auto"><table className="w-full text-xs">
                <thead><tr className="border-b">{["日付", "科目", "金額", "税額(満額)", "否認額", "摘要"].map((h) => <th key={h} className="py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                <tbody>{(tax.inv_80_entries ?? []).slice(0, 20).map((e: ReviewTaxInv80Entry, i: number) => (
                  <tr key={i} className="border-b"><td className="py-1">{e.date}</td><td className="py-1">{e.account}</td><td className="py-1 text-right tabular-nums">{fmt(e.amount)}</td><td className="py-1 text-right tabular-nums">{fmt(e.tax_full)}</td><td className="py-1 text-right tabular-nums text-red-600">{fmt(e.denied)}</td><td className="py-1 text-muted-foreground truncate max-w-[200px]">{e.memo}</td></tr>
                ))}</tbody>
              </table></div></CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 仕訳帳 */}
      {section === "journal" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border p-3"><div className="text-[10px] text-muted-foreground">仕訳件数</div><div className="text-lg font-bold">{fmt(journal?.entry_count)}</div></div>
            <div className="rounded-lg border p-3"><div className="text-[10px] text-muted-foreground">重複仕訳</div><div className="text-lg font-bold text-red-600">{journal?.duplicates?.length || 0}</div></div>
            <div className="rounded-lg border p-3"><div className="text-[10px] text-muted-foreground">金額異常</div><div className="text-lg font-bold text-yellow-600">{journal?.anomalies?.length || 0}</div></div>
            <div className="rounded-lg border p-3"><div className="text-[10px] text-muted-foreground">摘要不備</div><div className="text-lg font-bold">{journal?.no_memo_count || 0}</div></div>
          </div>
          {(journal?.duplicates || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">重複仕訳</CardTitle></CardHeader>
              <CardContent><div className="overflow-x-auto"><table className="w-full text-xs">
                <thead><tr className="border-b">{["日付", "仕訳No", "借方", "金額", "摘要", "件数"].map((h) => <th key={h} className="py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                <tbody>{(journal.duplicates ?? []).slice(0, 10).map((d: ReviewJournalDuplicate, i: number) => (
                  <tr key={i} className="border-b"><td className="py-1">{d.date}</td><td className="py-1 text-muted-foreground">{(d.nos || []).join(', ')}</td><td className="py-1">{d.dr_acct}</td><td className="py-1 text-right tabular-nums">{fmt(d.dr_amt)}</td><td className="py-1 text-muted-foreground">{d.memo}</td><td className="py-1 text-red-600 font-bold">{d.count}</td></tr>
                ))}</tbody>
              </table></div></CardContent>
            </Card>
          )}
          {(journal?.personal || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">私的支出の可能性</CardTitle></CardHeader>
              <CardContent><div className="space-y-1">{(journal.personal ?? []).slice(0, 10).map((p: ReviewJournalPersonal, i: number) => (
                <p key={i} className="text-xs text-muted-foreground">{p.date} {p.dr_acct} {fmt(p.dr_amt)}円 — {p.memo}</p>
              ))}</div></CardContent>
            </Card>
          )}
          {journal?.karibarai && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">仮払金分析</CardTitle></CardHeader>
              <CardContent><p className="text-xs text-muted-foreground">借方合計: {fmt(journal.karibarai.debit_total)}円 / 貸方合計: {fmt(journal.karibarai.credit_total)}円 / 残高: {fmt(journal.karibarai.balance)}円</p></CardContent>
            </Card>
          )}
          {journal?.yakuin_kashitsuke && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">役員貸付金分析</CardTitle></CardHeader>
              <CardContent><p className="text-xs text-muted-foreground">借方合計: {fmt(journal.yakuin_kashitsuke.debit_total)}円 / 貸方合計: {fmt(journal.yakuin_kashitsuke.credit_total)}円 / 残高: {fmt(journal.yakuin_kashitsuke.balance)}円</p></CardContent>
            </Card>
          )}
        </div>
      )}

      {/* クロスチェック */}
      {section === "cross" && (
        <div className="space-y-4">
          {(crossCheck?.findings || []).length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">クロスチェック項目はありません</CardContent></Card>
          ) : ((crossCheck?.findings ?? []).map((f: ReviewCrossFinding, i: number) => {
            const sevMap: Record<string, "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"> = {
              "高": "HIGH",
              "中": "MEDIUM",
              "低": "LOW",
            };
            return (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Badge className={cn("text-[10px]", f.priority === "高" ? "bg-red-100 text-red-800" : f.priority === "中" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-800")}>{f.priority}</Badge>
                      {f.title}
                    </CardTitle>
                    <ActionizeButton
                      sourceScreen="MONTHLY_REVIEW"
                      sourceRef={{ findingIndex: i, priority: f.priority, kind: "cross-check" }}
                      defaultTitle={f.title}
                      defaultDescription={f.interpretation}
                      defaultSeverity={sevMap[f.priority] ?? "MEDIUM"}
                      defaultOwnerRole="ADVISOR"
                      size="sm"
                    />
                  </div>
                </CardHeader>
                <CardContent><p className="text-xs text-muted-foreground">{f.interpretation}</p></CardContent>
              </Card>
            );
          }))}
        </div>
      )}

      {/* 指摘一覧 */}
      {section === "alerts" && (
        <Card><CardContent className="divide-y p-0">
          {(alerts || []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">指摘事項はありません</div>
          ) : alerts.map((alert: ReviewAlert, i: number) => {
            const config = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.LOW;
            const sevMap: Record<string, "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"> = {
              HIGH: "HIGH",
              MEDIUM: "MEDIUM",
              LOW: "LOW",
            };
            return (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <Badge className={cn("mt-0.5 shrink-0 border text-[10px]", config.color)}>{config.label}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{alert.category}</span>
                    <span className="text-sm font-medium">{alert.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</p>
                </div>
                <ActionizeButton
                  sourceScreen="MONTHLY_REVIEW"
                  sourceRef={{ alertIndex: i, category: alert.category, kind: "review-alert" }}
                  defaultTitle={alert.title}
                  defaultDescription={alert.detail}
                  defaultSeverity={sevMap[alert.severity] ?? "MEDIUM"}
                  defaultOwnerRole="ADVISOR"
                  size="sm"
                />
              </div>
            );
          })}
        </CardContent></Card>
      )}

      {/* 再実行 */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => reviewQuery.refetch()} disabled={reviewQuery.isFetching}>
          <Play className="h-3 w-3" />再実行
        </Button>
      </div>
    </div>
  );
}

