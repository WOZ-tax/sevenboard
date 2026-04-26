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
import { useCurrentOrg } from "@/contexts/current-org";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { PeriodSegmentControl } from "@/components/ui/period-segment-control";
import { useMfOffice } from "@/hooks/use-mf-data";
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
import { AuditorCard } from "@/components/dashboard/auditor-card";
import { ApprovalCard } from "@/components/monthly-review/approval-card";
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

export default function MonthlyReviewPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("review");
  const orgId = useScopedOrgId();
  const { currentOrgId } = useCurrentOrg();
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
      <div className="space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">月次レビュー報告書</h1>
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
              月次レビュー
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

        <div className="screen-only">
          <AuditorCard />
        </div>

        {currentOrgId && fiscalYear && (
          <ApprovalCard orgId={currentOrgId} fiscalYear={fiscalYear} month={currentMonth} />
        )}

        {/* タブ */}
        <div
          role="tablist"
          aria-label="月次レビューの表示セクション"
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

