"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import {
  Users,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
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
  const [myOnly, setMyOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  const records = progressQuery.data || [];

  // ステータスフィルタ
  const filtered = statusFilter === "all"
    ? records
    : records.filter((r: any) => {
        const latest = getLatestStatus(r.monthlyStatus);
        return latest.status === statusFilter;
      });

  // 集計
  const totalCount = records.length;
  const completedAll = records.filter((r: any) => getCompletedCount(r.monthlyStatus) >= 12).length;
  const inProgress = records.filter((r: any) => {
    const latest = getLatestStatus(r.monthlyStatus);
    return latest.status.startsWith("1.") || latest.status.startsWith("2.") || latest.status.startsWith("3.");
  }).length;
  const notStarted = records.filter((r: any) => {
    const latest = getLatestStatus(r.monthlyStatus);
    return latest.status.startsWith("0.");
  }).length;

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

        {/* サマリーカード */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-[var(--color-text-primary)]">{totalCount}</div>
            <div className="text-[10px] text-muted-foreground">担当クライアント</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{notStarted}</div>
            <div className="text-[10px] text-red-600">未着手</div>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center">
            <div className="text-2xl font-bold text-yellow-700">{inProgress}</div>
            <div className="text-[10px] text-yellow-600">作業中</div>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{completedAll}</div>
            <div className="text-[10px] text-green-600">全月完了</div>
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
              .sort((a: any, b: any) => {
                // 遅れている順にソート（未作業で月が進んでいるほど上）
                const aLatest = getLatestStatus(a.monthlyStatus);
                const bLatest = getLatestStatus(b.monthlyStatus);
                const aPriority = (STATUS_CONFIG[aLatest.status]?.priority ?? 0) * 100 - aLatest.month;
                const bPriority = (STATUS_CONFIG[bLatest.status]?.priority ?? 0) * 100 - bLatest.month;
                return bPriority - aPriority;
              })
              .map((record: any, i: number) => {
                const latest = getLatestStatus(record.monthlyStatus);
                const completed = getCompletedCount(record.monthlyStatus);
                const statusConfig = STATUS_CONFIG[latest.status] || STATUS_CONFIG["0.未作業"];
                const isDelayed = latest.month < currentMonth && !latest.status.startsWith("4.");

                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-4 py-3",
                      isDelayed && "border-red-200 bg-red-50/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
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
                      {/* 月次進捗バー */}
                      <div className="hidden items-center gap-0.5 sm:flex">
                        {Array.from({ length: 12 }, (_, m) => m + 1).map((m) => {
                          const s = record.monthlyStatus[m] || "0.未作業";
                          const bg = s.startsWith("4.") ? "bg-green-500"
                            : s.startsWith("3.") ? "bg-blue-500"
                            : s.startsWith("2.") ? "bg-sky-300"
                            : s.startsWith("1.") ? "bg-yellow-400"
                            : s.startsWith("5.") ? "bg-gray-300"
                            : "bg-gray-200";
                          return (
                            <div
                              key={m}
                              className={cn("h-4 w-3 rounded-sm", bg)}
                              title={`${m}月: ${STATUS_CONFIG[s]?.label || s}`}
                            />
                          );
                        })}
                      </div>
                      <div className="text-right">
                        <Badge className={cn("border text-[10px]", statusConfig.color)}>
                          {latest.month}月: {statusConfig.label}
                        </Badge>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {completed}/12 完了
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
