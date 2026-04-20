"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Overall = "HEALTHY" | "DEGRADED" | "UNKNOWN";
type SyncResult = "SUCCESS" | "PARTIAL" | "FAILED";

interface SourceStatus {
  source: string;
  lastSyncAt: string | null;
  status: SyncResult | null;
  errorMessage: string | null;
  durationMs: number | null;
}

interface SyncLog {
  id: string;
  source: string;
  status: SyncResult;
  errorMessage: string | null;
  syncedAt: string;
  durationMs: number | null;
}

const sourceLabels: Record<string, string> = {
  MF_CLOUD: "MFクラウド（会計）",
  KINTONE: "kintone",
  SLACK: "Slack",
  TAX_PLUGIN: "Tax Plugin",
  BOOKKEEPING_PLUGIN: "Bookkeeping Plugin",
};

const sourceDescriptions: Record<string, string> = {
  MF_CLOUD: "試算表・仕訳帳・科目マスタ",
  KINTONE: "顧客・契約・社内ワークフロー",
  SLACK: "顧問スレッド・通知",
  TAX_PLUGIN: "税務レビュー結果",
  BOOKKEEPING_PLUGIN: "記帳・月次データ",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "未同期";
  const now = new Date();
  const past = new Date(iso);
  const diffMs = now.getTime() - past.getTime();
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 60) return `${Math.max(mins, 1)}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000 / 60)}分`;
}

/* mock fallback */

const mockStatus = {
  overall: "HEALTHY" as Overall,
  sources: [
    {
      source: "MF_CLOUD",
      lastSyncAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      status: "SUCCESS" as const,
      errorMessage: null,
      durationMs: 2840,
    },
    {
      source: "KINTONE",
      lastSyncAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      status: "SUCCESS" as const,
      errorMessage: null,
      durationMs: 1120,
    },
    {
      source: "SLACK",
      lastSyncAt: null,
      status: null,
      errorMessage: null,
      durationMs: null,
    },
    {
      source: "TAX_PLUGIN",
      lastSyncAt: null,
      status: null,
      errorMessage: null,
      durationMs: null,
    },
    {
      source: "BOOKKEEPING_PLUGIN",
      lastSyncAt: null,
      status: null,
      errorMessage: null,
      durationMs: null,
    },
  ],
};

const mockLogs: SyncLog[] = [
  {
    id: "l1",
    source: "MF_CLOUD",
    status: "SUCCESS",
    errorMessage: null,
    syncedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    durationMs: 2840,
  },
  {
    id: "l2",
    source: "KINTONE",
    status: "SUCCESS",
    errorMessage: null,
    syncedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    durationMs: 1120,
  },
];

export default function DataHealthPage() {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";

  const { data: statusData } = useQuery({
    queryKey: ["data-health", orgId],
    queryFn: () => api.dataHealth.getStatus(orgId),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const { data: logsData } = useQuery({
    queryKey: ["data-health-logs", orgId],
    queryFn: () => api.dataHealth.getLogs(orgId, 100),
    enabled: !!orgId,
  });

  const status = statusData ?? mockStatus;
  const logs: SyncLog[] = (logsData as SyncLog[] | undefined) ?? mockLogs;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              データ鮮度センター
            </h1>
            <p className="text-sm text-muted-foreground">
              外部連携の同期状況を一覧。どの数値が最新かを判断する根拠
            </p>
          </div>
        </div>

        {/* overall */}
        <OverallCard overall={status.overall as Overall} />

        {/* per-source */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">
            連携ソース別ステータス
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {status.sources.map((s) => (
              <SourceCard key={s.source} source={s as SourceStatus} />
            ))}
          </div>
        </div>

        {/* log */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">
            同期ログ（直近100件）
          </h2>
          <Card>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  同期ログがありません
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/40 text-left">
                    <tr>
                      <th className="p-2 font-medium">日時</th>
                      <th className="p-2 font-medium">ソース</th>
                      <th className="p-2 font-medium">結果</th>
                      <th className="p-2 font-medium">所要時間</th>
                      <th className="p-2 font-medium">エラー</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(log.syncedAt)}
                        </td>
                        <td className="p-2">
                          {sourceLabels[log.source] ?? log.source}
                        </td>
                        <td className="p-2">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {formatDuration(log.durationMs)}
                        </td>
                        <td className="p-2 text-[var(--color-error)] max-w-xs truncate">
                          {log.errorMessage || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

/* ---------- sub-components ---------- */

function OverallCard({ overall }: { overall: Overall }) {
  const cfg = {
    HEALTHY: {
      icon: CheckCircle2,
      label: "データは最新です",
      detail: "すべての連携ソースが正常に同期されています",
      cls: "border-[var(--color-success)]/40 bg-[#e8f5e9]",
      iconCls: "text-[var(--color-success)]",
    },
    DEGRADED: {
      icon: AlertTriangle,
      label: "一部の連携に問題があります",
      detail: "下記のソースを確認してください。数値の信頼性に影響する可能性があります",
      cls: "border-[var(--color-error)]/40 bg-[#fce4ec]",
      iconCls: "text-[var(--color-error)]",
    },
    UNKNOWN: {
      icon: HelpCircle,
      label: "連携が設定されていません",
      detail: "外部データソースに接続するとリアルタイムに状態を確認できます",
      cls: "border-muted-foreground/30 bg-muted/30",
      iconCls: "text-muted-foreground",
    },
  }[overall];

  return (
    <Card className={cn("border-2", cfg.cls)}>
      <CardContent className="p-4 flex items-center gap-4">
        <cfg.icon className={cn("h-8 w-8 shrink-0", cfg.iconCls)} />
        <div>
          <div className="text-base font-semibold text-[var(--color-text-primary)]">
            {cfg.label}
          </div>
          <div className="text-sm text-muted-foreground">{cfg.detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceCard({ source }: { source: SourceStatus }) {
  const label = sourceLabels[source.source] ?? source.source;
  const description = sourceDescriptions[source.source] ?? "";
  const isStale = source.lastSyncAt
    ? Date.now() - new Date(source.lastSyncAt).getTime() > 24 * 60 * 60_000
    : false;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              {label}
            </div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
          <StatusBadge status={source.status} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">最終同期</div>
            <div
              className={cn(
                "mt-0.5 inline-flex items-center gap-1",
                isStale && "text-[var(--color-warning)]",
              )}
            >
              <Clock className="h-3 w-3" />
              {formatRelative(source.lastSyncAt)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">所要時間</div>
            <div className="mt-0.5">{formatDuration(source.durationMs)}</div>
          </div>
        </div>
        {source.errorMessage && (
          <div className="mt-2 rounded border border-[var(--color-error)]/30 bg-[#fce4ec] p-2 text-xs text-[var(--color-error)]">
            {source.errorMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: SyncResult | null }) {
  if (status === null) {
    return (
      <Badge
        variant="outline"
        className="border-gray-300 bg-gray-50 text-gray-600 text-xs"
      >
        未連携
      </Badge>
    );
  }
  const cfg = {
    SUCCESS: {
      icon: CheckCircle2,
      label: "成功",
      cls: "border-[var(--color-success)]/40 bg-[#e8f5e9] text-[var(--color-success)]",
    },
    PARTIAL: {
      icon: AlertTriangle,
      label: "部分成功",
      cls: "border-[var(--color-warning)]/40 bg-[#fff4e5] text-[var(--color-warning)]",
    },
    FAILED: {
      icon: XCircle,
      label: "失敗",
      cls: "border-[var(--color-error)]/40 bg-[#fce4ec] text-[var(--color-error)]",
    },
  }[status];
  return (
    <Badge variant="outline" className={cn("text-xs gap-1", cfg.cls)}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
