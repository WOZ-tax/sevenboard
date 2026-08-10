"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  FileText,
  ChevronRight,
  Loader2,
  Printer,
  ClipboardList,
  StickyNote,
} from "lucide-react";
import { ChoshoTab } from "./_tabs/chosho-tab";
import { MemoTab } from "./_tabs/memo-tab";
import type { KintoneMonthlyProgress } from "@/lib/mf-types";

type TabKey = "chosho" | "memo";

// 残高調書 → レビューメモ の 2 タブ構成。
// 経理レビューは /monthly-review へ独立メニュー化。仕訳レビュー・チェックリストは
// UI から外した (実装は _tabs/journal-tab.tsx と本ファイルの ChecklistTab に残置)。
const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "chosho", label: "残高調書", icon: ClipboardList },
  { key: "memo", label: "レビューメモ", icon: StickyNote },
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

// Next.js 16 + Turbopack の static prerender では useSearchParams() を持つ component は
// Suspense boundary で包む必要がある (CSR bailout エラー回避)。
// 既存の page 本体は Inner に rename し、default export で Suspense でラップする。
export default function AccountingReviewPage() {
  return (
    <Suspense fallback={null}>
      <AccountingReviewPageInner />
    </Suspense>
  );
}

function AccountingReviewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?tab=chosho|memo で初期タブを決定。未指定・不正値なら chosho (残高調書)。
  const tabFromQuery = searchParams.get("tab");
  const isValidTab = (v: string | null): v is TabKey =>
    v === "chosho" || v === "memo";
  const [activeTab, setActiveTabState] = useState<TabKey>(
    isValidTab(tabFromQuery) ? tabFromQuery : "chosho",
  );
  // ?tab=review は /monthly-review へ送るだけなので、遷移が確定するまで
  // 残高調書 (MF を 12 ヶ月分叩く) をマウントしない。
  const leavingForMonthlyReview = tabFromQuery === "review";
  // URL の ?tab= 変更に追従して activeTab を更新する。
  // (メモタブの 🔗 リンク等、外から router.push で URL を変えてくる経路で
  //  page を unmount せずに activeTab を切り替えるための同期)。
  //
  // あわせてメニュー再編前の ?tab= 値を受ける:
  //   review              → 月次レビューは /monthly-review へ独立したのでリダイレクト
  //   journal / checklist → タブを UI から外したので残高調書へフォールバック
  useEffect(() => {
    if (tabFromQuery === "review") {
      router.replace("/monthly-review");
      return;
    }
    if (tabFromQuery === "journal" || tabFromQuery === "checklist") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "chosho");
      router.replace(`/accounting-review?${params.toString()}`, { scroll: false });
      return;
    }
    if (isValidTab(tabFromQuery) && tabFromQuery !== activeTab) {
      setActiveTabState(tabFromQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTab は依存に入れない (ループ防止)
  }, [tabFromQuery]);
  // タブ切替時に URL も同期 (リロード・共有リンクで同じタブに戻れるようにする)
  const setActiveTab = useCallback(
    (next: TabKey) => {
      setActiveTabState(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`/accounting-review?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );
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
          <h1 className="text-xl font-bold">残高調書</h1>
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
              残高調書
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

        {/* 調書メイン化 — 健康サマリーとAI質疑応答は他画面へ分離 */}
        {/* タブ */}
        <div
          role="tablist"
          aria-label="残高調書の表示セクション"
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
        {!leavingForMonthlyReview && activeTab === "chosho" && (
          <div role="tabpanel" id="monthly-panel-chosho" aria-labelledby="monthly-tab-chosho">
            <ChoshoTab orgId={orgId} fiscalYear={fiscalYear} month={month} />
          </div>
        )}

        {!leavingForMonthlyReview && activeTab === "memo" && (
          <div role="tabpanel" id="monthly-panel-memo" aria-labelledby="monthly-tab-memo">
            <MemoTab orgId={orgId} fiscalYear={fiscalYear} month={month} />
          </div>
        )}

      </div>
    </DashboardShell>
  );
}


/**
 * 月次進捗チェックリスト。
 *
 * メニュー再編でタブからは外したが、復活させやすいよう実装は残置する
 * (export しているのは未使用シンボル扱いを避けるため)。
 */
export function ChecklistTab({
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
