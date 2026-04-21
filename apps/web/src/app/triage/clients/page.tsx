"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import type { KintoneMonthlyProgress } from "@/lib/mf-types";
import { usePeriodStore } from "@/lib/period-store";
import {
  Users,
  Search,
  ChevronRight,
  Loader2,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; priority: number }> = {
  "0.未作業": { label: "未作業", color: "bg-gray-200 text-gray-700", priority: 3 },
  "1.資料依頼済": { label: "依頼済", color: "bg-yellow-100 text-yellow-800", priority: 2 },
  "2.資料回収済": { label: "回収済", color: "bg-blue-100 text-blue-800", priority: 1 },
  "3.入力済": { label: "入力済", color: "bg-indigo-100 text-indigo-800", priority: 0 },
  "4.納品済": { label: "納品済", color: "bg-green-100 text-green-800", priority: -1 },
  "5.実施不要": { label: "不要", color: "bg-gray-100 text-gray-400", priority: -2 },
};

function getLatestStatus(monthlyStatus: Record<number, string>): { month: number; status: string } {
  // 最新の作業中月を見つける（納品済でない最初の月）
  for (let m = 1; m <= 12; m++) {
    const s = monthlyStatus[m] || "0.未作業";
    if (!s.startsWith("4.") && !s.startsWith("5.")) {
      return { month: m, status: s };
    }
  }
  return { month: 12, status: "4.納品済" };
}

function getCompletedCount(monthlyStatus: Record<number, string>): number {
  return Object.values(monthlyStatus).filter(
    (s) => s.startsWith("3.") || s.startsWith("4."),
  ).length;
}

export default function TriagePage() {
  const user = useAuthStore((s) => s.user);
  const switchOrgStore = useAuthStore((s) => s.switchOrg);
  const router = useRouter();
  const queryClient = useQueryClient();
  const periodMonth = usePeriodStore((s) => s.month);
  const [myOnly, setMyOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [switchingClient, setSwitchingClient] = useState<string | null>(null);
  const [targetMonth, setTargetMonth] = useState<number>(
    periodMonth ?? new Date().getMonth() + 1,
  );

  // 自分の名前でフィルタ（myOnly時）
  const assignee = myOnly ? (user?.name || "") : undefined;

  const progressQuery = useQuery({
    queryKey: ["kintone", "triage", assignee, search],
    queryFn: () =>
      api.kintone.getMonthlyProgress(
        new Date().getFullYear().toString(),
        search || undefined,
        assignee,
      ),
    staleTime: 60 * 1000,
  });

  // ADVISORのorg一覧を取得（MF事業者番号でマッチング用）
  const orgsQuery = useQuery({
    queryKey: ["advisor", "orgs"],
    queryFn: () => api.getAdvisorOrgs(),
    staleTime: 5 * 60 * 1000,
    enabled: user?.role === "ADVISOR",
  });

  // クライアント選択→org切替→月次レビューへ
  const handleSelectClient = useCallback(async (record: KintoneMonthlyProgress) => {
    if (switchingClient) return;

    // MF事業者番号でorgを特定
    const mfCode = record.mfOfficeCode;
    const orgs = orgsQuery.data || [];
    // orgのcodeフィールドとMF事業者番号をマッチ（将来的にはDB紐付け）
    // 現状はデモ用: 最初のorgに切替
    const targetOrg = orgs.find((o) => o.code === mfCode) || orgs[0];

    if (!targetOrg) {
      // ADVISORでない場合 or orgが見つからない → 月次レビューにそのまま遷移
      router.push("/monthly-review");
      return;
    }

    setSwitchingClient(record.clientName);
    try {
      const result = await api.switchOrg(targetOrg.id);
      switchOrgStore(result.accessToken, result.user);
      // キャッシュクリア（新しいorgのデータに切替）
      queryClient.clear();
      router.push("/monthly-review");
    } catch (err) {
      console.error("Org switch failed", err);
      // 失敗してもレビューには遷移
      router.push("/monthly-review");
    } finally {
      setSwitchingClient(null);
    }
  }, [switchingClient, orgsQuery.data, switchOrgStore, queryClient, router]);

  const records = progressQuery.data || [];

  // 選択月ベースのステータスアクセサ
  const statusOf = useCallback(
    (r: KintoneMonthlyProgress) => r.monthlyStatus?.[targetMonth] || "0.未作業",
    [targetMonth],
  );

  // ステータスフィルタ（選択月のステータスで絞り込み）
  const filtered = statusFilter === "all"
    ? records
    : records.filter((r) => statusOf(r) === statusFilter);

  // 集計（選択月ベース）
  const totalCount = records.length;
  const monthCompleted = records.filter((r) => statusOf(r).startsWith("4.")).length;
  const monthInProgress = records.filter((r) => {
    const s = statusOf(r);
    return s.startsWith("1.") || s.startsWith("2.") || s.startsWith("3.");
  }).length;
  const monthNotStarted = records.filter((r) => statusOf(r).startsWith("0.")).length;

  // 現在月（遅延判定用）
  const currentMonth = new Date().getMonth() + 1;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                顧問先トリアージ
              </h1>
              <p className="text-sm text-muted-foreground">
                {myOnly ? `${user?.name || "自分"}の担当` : "全クライアント"} — {new Date().getFullYear()}年度
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={myOnly ? "default" : "outline"}
              size="sm"
              className={cn("text-xs", myOnly && "bg-[var(--color-primary)] text-white")}
              onClick={() => setMyOnly(true)}
            >
              自分の担当
            </Button>
            <Button
              variant={!myOnly ? "default" : "outline"}
              size="sm"
              className={cn("text-xs", !myOnly && "bg-[var(--color-primary)] text-white")}
              onClick={() => setMyOnly(false)}
            >
              全件
            </Button>
          </div>
        </div>

        {/* サマリーカード (選択月ベース) */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-[var(--color-text-primary)]">{totalCount}</div>
            <div className="text-[10px] text-muted-foreground">担当クライアント</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{monthNotStarted}</div>
            <div className="text-[10px] text-red-600">{targetMonth}月 未着手</div>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center">
            <div className="text-2xl font-bold text-yellow-700">{monthInProgress}</div>
            <div className="text-[10px] text-yellow-600">{targetMonth}月 作業中</div>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{monthCompleted}</div>
            <div className="text-[10px] text-green-600">{targetMonth}月 納品済</div>
          </div>
        </div>

        {/* フィルター */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="クライアント名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">対象月:</span>
            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(parseInt(e.target.value, 10))}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              aria-label="フィルター対象月"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1">
            {[
              { key: "all", label: "全て" },
              { key: "0.未作業", label: "未着手" },
              { key: "1.資料依頼済", label: "依頼済" },
              { key: "2.資料回収済", label: "回収済" },
              { key: "3.入力済", label: "入力済" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  statusFilter === f.key
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "border-input text-muted-foreground hover:bg-muted/50",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* クライアント一覧 */}
        {progressQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              該当するクライアントはありません
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered
              .sort((a, b) => {
                // 選択月のステータス優先順（未着手ほど上）→ フォールバックに最新作業月
                const aMonthStatus = statusOf(a);
                const bMonthStatus = statusOf(b);
                const aP = STATUS_CONFIG[aMonthStatus]?.priority ?? 0;
                const bP = STATUS_CONFIG[bMonthStatus]?.priority ?? 0;
                if (aP !== bP) return bP - aP;
                const aLatest = getLatestStatus(a.monthlyStatus);
                const bLatest = getLatestStatus(b.monthlyStatus);
                return aLatest.month - bLatest.month;
              })
              .map((record, i) => {
                const monthStatus = statusOf(record);
                const completed = getCompletedCount(record.monthlyStatus);
                const statusConfig = STATUS_CONFIG[monthStatus] || STATUS_CONFIG["0.未作業"];
                const isDelayed = targetMonth <= currentMonth && !monthStatus.startsWith("4.") && !monthStatus.startsWith("5.");

                const isSwitching = switchingClient === record.clientName;

                return (
                  <button
                    key={i}
                    onClick={() => handleSelectClient(record)}
                    disabled={!!switchingClient}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/30",
                      isDelayed && "border-red-200 bg-red-50/50 hover:bg-red-50",
                      isSwitching && "opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {isSwitching ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                          ) : null}
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">
                            {record.clientName}
                          </span>
                          {isDelayed && (
                            <Badge className="border border-red-300 bg-red-100 text-[10px] text-red-700">
                              遅延
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>決算: {record.closingMonth}</span>
                          <span>IC: {record.inCharge?.join(", ") || "—"}</span>
                          <span>コミット: {record.commitment || "—"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* 月次進捗バー (選択月をハイライト) */}
                      <div className="hidden items-center gap-0.5 sm:flex">
                        {Array.from({ length: 12 }, (_, m) => m + 1).map((m) => {
                          const s = record.monthlyStatus[m] || "0.未作業";
                          const bg = s.startsWith("4.") ? "bg-green-500"
                            : s.startsWith("3.") ? "bg-blue-500"
                            : s.startsWith("2.") ? "bg-sky-300"
                            : s.startsWith("1.") ? "bg-yellow-400"
                            : s.startsWith("5.") ? "bg-gray-300"
                            : "bg-gray-200";
                          const highlight = m === targetMonth;
                          return (
                            <div
                              key={m}
                              className={cn(
                                "h-4 w-3 rounded-sm",
                                bg,
                                highlight && "ring-2 ring-[var(--color-primary)] ring-offset-1",
                              )}
                              title={`${m}月: ${STATUS_CONFIG[s]?.label || s}`}
                            />
                          );
                        })}
                      </div>
                      <div className="text-right">
                        <Badge className={cn("border text-[10px]", statusConfig.color)}>
                          {targetMonth}月: {statusConfig.label}
                        </Badge>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {completed}/12 完了
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
