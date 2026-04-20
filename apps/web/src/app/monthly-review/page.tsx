"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import {
  useMfDashboard,
  useMfPL,
  useMfBS,
  useMfCashflow,
  useMfFinancialIndicators,
  useMfOffice,
} from "@/hooks/use-mf-data";
import { formatManYen, getValueColor } from "@/lib/format";
import {
  ClipboardCheck,
  FileText,
  BarChart3,
  Wallet,
  Gauge,
  AlertTriangle,
  Bot,
  ChevronRight,
  Play,
  Loader2,
} from "lucide-react";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { AgentBanner } from "@/components/agent/agent-banner";
import { AGENTS } from "@/lib/agent-voice";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { AuditorCard } from "@/components/dashboard/auditor-card";

type TabKey = "checklist" | "review" | "pl" | "bs" | "cashflow" | "indicators";

const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "checklist", label: "チェックリスト", icon: ClipboardCheck },
  { key: "review", label: "経理レビュー", icon: AlertTriangle },
  { key: "pl", label: "P/L", icon: BarChart3 },
  { key: "bs", label: "B/S", icon: FileText },
  { key: "cashflow", label: "資金繰り", icon: Wallet },
  { key: "indicators", label: "財務指標", icon: Gauge },
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

export default function MonthlyReviewPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("checklist");
  const user = useAuthStore((s) => s.user);
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const queryClient = useQueryClient();

  const office = useMfOffice();
  const dashboard = useMfDashboard();
  const mfPL = useMfPL();
  const mfBS = useMfBS();
  const mfCF = useMfCashflow();
  const indicators = useMfFinancialIndicators();

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

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              月次レビュー
            </h1>
            <p className="text-sm text-muted-foreground">
              {office.data?.name || "—"} — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* 進捗ステータス */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{currentMonth}月:</span>
              <Badge className={cn("border text-xs", statusInfo.color)}>
                {statusInfo.label}
              </Badge>
              {kintoneProgress.data && getNextStatus(currentStatus) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
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
                  次へ進める
                  <ChevronRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>

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

        <AuditorCard />

        {/* KPIサマリーバー */}
        {dashboard.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "売上高", value: `${Math.round(dashboard.data.revenue / 10000).toLocaleString()}万` },
              { label: "営業利益", value: `${Math.round(dashboard.data.operatingProfit / 10000).toLocaleString()}万` },
              { label: "現預金", value: `${Math.round(dashboard.data.cashBalance / 10000).toLocaleString()}万` },
              { label: "ランウェイ", value: `${dashboard.data.runway}ヶ月` },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border bg-muted/20 px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{kpi.label}</div>
                <div className="text-sm font-bold text-[var(--color-text-primary)]">{kpi.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* タブ */}
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  activeTab === tab.key
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
        )}

        {activeTab === "review" && (
          <ReviewTab orgId={user?.orgId || ""} fiscalYear={fiscalYear} />
        )}

        {activeTab === "pl" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">損益計算書（P/L）</CardTitle>
            </CardHeader>
            <CardContent>
              {mfPL.isLoading ? (
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}</div>
              ) : !mfPL.data ? (
                <MfEmptyState />
              ) : (
                <SimpleTable rows={mfPL.data} />
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "bs" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">資産の部</CardTitle></CardHeader>
              <CardContent>
                {mfBS.isLoading ? <div className="h-32 animate-pulse rounded bg-muted" /> : !mfBS.data?.assets ? <MfEmptyState /> : <SimpleTable rows={mfBS.data.assets} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">負債・純資産の部</CardTitle></CardHeader>
              <CardContent>
                {!mfBS.data?.liabilitiesEquity ? null : <SimpleTable rows={mfBS.data.liabilitiesEquity} />}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "cashflow" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">資金繰り</CardTitle></CardHeader>
            <CardContent>
              {mfCF.isLoading ? <div className="h-32 animate-pulse rounded bg-muted" /> : !mfCF.data ? <MfEmptyState /> : (
                <p className="text-sm text-muted-foreground">
                  ランウェイ: {mfCF.data.runway?.months}ヶ月 / 現預金: {formatManYen(mfCF.data.runway?.cashBalance || 0)} / 月次バーン: {formatManYen(mfCF.data.runway?.monthlyBurnRate || 0)}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "indicators" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">財務指標</CardTitle></CardHeader>
            <CardContent>
              {indicators.isLoading ? <div className="h-32 animate-pulse rounded bg-muted" /> : !indicators.data ? <MfEmptyState /> : (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "流動比率", value: `${indicators.data.currentRatio?.toFixed(1)}%` },
                    { label: "自己資本比率", value: `${indicators.data.equityRatio?.toFixed(1)}%` },
                    { label: "売上総利益率", value: `${indicators.data.grossProfitMargin?.toFixed(1)}%` },
                    { label: "営業利益率", value: `${indicators.data.operatingProfitMargin?.toFixed(1)}%` },
                    { label: "ROA", value: `${indicators.data.roa?.toFixed(1)}%` },
                    { label: "総資産回転率", value: `${indicators.data.totalAssetTurnover?.toFixed(2)}回` },
                  ].map((ind) => (
                    <div key={ind.label} className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">{ind.label}</div>
                      <div className="text-lg font-bold">{ind.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

function ChecklistTab({
  progress,
  isLoading,
  onUpdateStatus,
}: {
  progress: any;
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

function ReviewTab({ orgId, fiscalYear }: { orgId: string; fiscalYear?: number }) {
  const reviewQuery = useQuery({
    queryKey: ["review", orgId, fiscalYear],
    queryFn: () => api.review.run(orgId, fiscalYear),
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
    return (
      <Card><CardContent className="py-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="text-sm text-red-600">レビュー実行に失敗しました</p>
        <Button className="mt-4" variant="outline" onClick={() => reviewQuery.refetch()}>再試行</Button>
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
      <div className="flex gap-1 overflow-x-auto">
        {sections.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
              section === s.key ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "border-input text-muted-foreground hover:bg-muted/50"
            )}>{s.label}</button>
        ))}
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
              <CardContent className="space-y-1">{pl.interpretations.map((t: string, i: number) => <p key={i} className="text-xs text-muted-foreground">{t}</p>)}</CardContent>
            </Card>
          )}
          {(bs?.stagnant_interpretations || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">滞留勘定</CardTitle></CardHeader>
              <CardContent className="space-y-1">{bs.stagnant_interpretations.map((t: string, i: number) => <p key={i} className="text-xs text-muted-foreground">{t}</p>)}</CardContent>
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
              <thead><tr className="border-b">{["月", "売上高", "販管費", "販管費率", "営業利益", "経常利益"].map((h) => <th key={h} className="py-1.5 text-right font-semibold first:text-left">{h}</th>)}</tr></thead>
              <tbody>{(pl?.monthly_table || []).map((m: any, i: number) => (
                <tr key={i} className={cn("border-b", m.operating < 0 && "bg-red-50")}>
                  <td className="py-1.5 font-medium">{m.month}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(m.sales)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(m.sga)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.sga_ratio}%</td>
                  <td className={cn("py-1.5 text-right tabular-nums", m.operating < 0 && "text-red-600 font-bold")}>{fmt(m.operating)}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", m.ordinary < 0 && "text-red-600")}>{fmt(m.ordinary)}</td>
                </tr>
              ))}</tbody>
            </table></div></CardContent>
          </Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">販管費構成 Top10</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b"><th className="py-1.5 text-left font-semibold">勘定科目</th><th className="py-1.5 text-right font-semibold">合計</th></tr></thead>
              <tbody>{(pl?.sga_breakdown || []).map((s: any, i: number) => (
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
              <thead><tr className="border-b">{["月", "流動比率", "自己資本比率"].map((h) => <th key={h} className="py-1.5 text-right font-semibold first:text-left">{h}</th>)}</tr></thead>
              <tbody>{(bs?.ratios || []).map((r: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="py-1.5 font-medium">{r.month}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", r.current_ratio < 100 && "text-red-600")}>{r.current_ratio}%</td>
                  <td className={cn("py-1.5 text-right tabular-nums", r.equity_ratio < 0 && "text-red-600")}>{r.equity_ratio}%</td>
                </tr>
              ))}</tbody>
            </table></div></CardContent>
          </Card>
          {(bs?.negatives || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">マイナス残高 ({bs.negatives.length}件)</CardTitle></CardHeader>
              <CardContent><div className="space-y-1">{(bs?.neg_interpretations || []).map((t: string, i: number) => <p key={i} className="text-xs text-muted-foreground">{t}</p>)}</div></CardContent>
            </Card>
          )}
          {(bs?.stagnant || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">滞留勘定 ({bs.stagnant.length}件)</CardTitle></CardHeader>
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
                <tbody>{tax.mismatches.slice(0, 20).map((m: any, i: number) => (
                  <tr key={i} className="border-b"><td className="py-1">{m.date}</td><td className="py-1">{m.no}</td><td className="py-1">{m.account}</td><td className="py-1 text-red-600">{m.actual_tax}</td><td className="py-1 text-green-600">{m.expected_tax}</td><td className="py-1 text-muted-foreground truncate max-w-[200px]">{m.memo}</td></tr>
                ))}</tbody>
              </table></div></CardContent>
            </Card>
          )}
          {(tax?.inv_80_entries || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">インボイス80%控除 ({tax.inv_80_entries.length}件)</CardTitle></CardHeader>
              <CardContent><div className="overflow-x-auto"><table className="w-full text-xs">
                <thead><tr className="border-b">{["日付", "科目", "金額", "税額(満額)", "否認額", "摘要"].map((h) => <th key={h} className="py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                <tbody>{tax.inv_80_entries.slice(0, 20).map((e: any, i: number) => (
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
                <tbody>{journal.duplicates.slice(0, 10).map((d: any, i: number) => (
                  <tr key={i} className="border-b"><td className="py-1">{d.date}</td><td className="py-1 text-muted-foreground">{(d.nos || []).join(', ')}</td><td className="py-1">{d.dr_acct}</td><td className="py-1 text-right tabular-nums">{fmt(d.dr_amt)}</td><td className="py-1 text-muted-foreground">{d.memo}</td><td className="py-1 text-red-600 font-bold">{d.count}</td></tr>
                ))}</tbody>
              </table></div></CardContent>
            </Card>
          )}
          {(journal?.personal || []).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">私的支出の可能性</CardTitle></CardHeader>
              <CardContent><div className="space-y-1">{journal.personal.slice(0, 10).map((p: any, i: number) => (
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
          ) : (crossCheck.findings.map((f: any, i: number) => {
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
          ) : alerts.map((alert: any, i: number) => {
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

function SimpleTable({ rows }: { rows: { category: string; current: number; prior?: number; isTotal?: boolean; isHeader?: boolean }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-[var(--color-border)]">
            <th className="w-56 py-2 text-left font-semibold text-[var(--color-text-primary)]">勘定科目</th>
            <th className="w-32 py-2 text-right font-semibold text-[var(--color-text-primary)]">当期</th>
            <th className="w-32 py-2 text-right font-semibold text-[var(--color-text-primary)]">前期</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cn(row.isTotal && "bg-muted/50 font-semibold", row.isHeader && "bg-muted/30")}>
              <td className={cn("py-1.5 text-sm", row.isTotal && "font-bold")}>{row.category}</td>
              <td className="py-1.5 text-right tabular-nums">{row.isHeader ? "" : `¥${row.current.toLocaleString()}`}</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{row.isHeader ? "" : row.prior != null ? `¥${row.prior.toLocaleString()}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
