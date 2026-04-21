"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Eye,
  MessageSquare,
  Play,
  Clock3,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type AgentKey = "BRIEF" | "SENTINEL" | "DRAFTER" | "AUDITOR" | "COPILOT";
type RunMode = "OBSERVE" | "DIALOG" | "EXECUTE" | "CRON";
type RunStatus = "SUCCESS" | "FALLBACK" | "FAILED";

const FILTERS: Array<{ key: "ALL" | AgentKey; label: string }> = [
  { key: "ALL", label: "全て" },
  { key: "BRIEF", label: "サマリー" },
  { key: "SENTINEL", label: "sentinel" },
  { key: "DRAFTER", label: "drafter" },
  { key: "AUDITOR", label: "auditor" },
  { key: "COPILOT", label: "copilot" },
];

const AGENT_LABEL: Record<AgentKey, string> = {
  BRIEF: "サマリー (brief)",
  SENTINEL: "sentinel",
  DRAFTER: "drafter",
  AUDITOR: "auditor",
  COPILOT: "copilot",
};

const MODE_LABEL: Record<RunMode, string> = {
  OBSERVE: "observe",
  DIALOG: "dialog",
  EXECUTE: "execute",
  CRON: "cron",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000 / 60)}分`;
}

function countToolCalls(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}

export default function AgentRunsPage() {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";
  const [filter, setFilter] = useState<"ALL" | AgentKey>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["agent-runs", orgId, filter],
    queryFn: () =>
      api.agentRuns.list(orgId, {
        agentKey: filter === "ALL" ? undefined : filter,
        limit: 80,
        days: 30,
      }),
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];

  const stats = (() => {
    const total = items.length;
    if (total === 0) return null;
    const success = items.filter((r) => r.status === "SUCCESS").length;
    const fallback = items.filter((r) => r.status === "FALLBACK").length;
    const failed = items.filter((r) => r.status === "FAILED").length;
    const durs = items
      .map((r) => r.durationMs)
      .filter((d): d is number => typeof d === "number" && d > 0);
    const avgMs = durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    const toolUses = items.reduce((acc, r) => acc + countToolCalls(r.toolCalls), 0);
    return { total, success, fallback, failed, avgMs, toolUses };
  })();

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              エージェント実行履歴
            </h1>
            <p className="text-sm text-muted-foreground">
              各エージェントが いつ・何を・どう実行したか（直近30日）
            </p>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatCell label="総実行数" value={`${stats.total}`} />
            <StatCell
              label="成功率"
              value={`${Math.round((stats.success / stats.total) * 100)}%`}
              tone={stats.success / stats.total >= 0.9 ? "good" : stats.success / stats.total >= 0.7 ? "warn" : "bad"}
            />
            <StatCell
              label="フォールバック"
              value={`${stats.fallback}件`}
              tone={stats.fallback === 0 ? "good" : "warn"}
            />
            <StatCell
              label="失敗"
              value={`${stats.failed}件`}
              tone={stats.failed === 0 ? "good" : "bad"}
            />
            <StatCell
              label="平均所要"
              value={stats.avgMs === null ? "—" : formatDuration(stats.avgMs)}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                filter === f.key
                  ? "border-[var(--color-tertiary)] bg-[var(--color-tertiary)]/10 text-[var(--color-tertiary)]"
                  : "border-gray-300 bg-white text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                読み込み中…
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                実行履歴がありません。エージェントを呼び出すと履歴が蓄積されます。
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40 text-left">
                  <tr>
                    <th className="p-2 font-medium">日時</th>
                    <th className="p-2 font-medium">エージェント</th>
                    <th className="p-2 font-medium">モード</th>
                    <th className="p-2 font-medium">結果</th>
                    <th className="p-2 font-medium">所要</th>
                    <th className="p-2 font-medium">tool</th>
                    <th className="p-2 font-medium">期間</th>
                    <th className="p-2 font-medium">エラー</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedId(run.id)}
                    >
                      <td className="p-2 whitespace-nowrap text-muted-foreground">
                        <div className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {formatDateTime(run.generatedAt)}
                        </div>
                      </td>
                      <td className="p-2 font-medium">
                        {AGENT_LABEL[run.agentKey]}
                      </td>
                      <td className="p-2">
                        <ModeBadge mode={run.mode} />
                      </td>
                      <td className="p-2">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {formatDuration(run.durationMs)}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {countToolCalls(run.toolCalls) > 0
                          ? `${countToolCalls(run.toolCalls)}件`
                          : "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {run.fiscalYear || run.endMonth
                          ? `FY${run.fiscalYear ?? "—"}/${run.endMonth ?? "—"}月`
                          : "—"}
                      </td>
                      <td className="p-2 text-[var(--color-error)] max-w-xs truncate">
                        {run.errorMessage || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <RunDetailSheet
        orgId={orgId}
        runId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </DashboardShell>
  );
}

function RunDetailSheet({
  orgId,
  runId,
  onClose,
}: {
  orgId: string;
  runId: string | null;
  onClose: () => void;
}) {
  const open = !!runId;
  const { data, isLoading } = useQuery({
    queryKey: ["agent-run", orgId, runId],
    queryFn: () => api.agentRuns.get(orgId, runId as string),
    enabled: open && !!orgId,
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {data
              ? `${AGENT_LABEL[data.agentKey]} の実行詳細`
              : "実行詳細"}
          </SheetTitle>
          <SheetDescription>
            {data
              ? `${formatDateTime(data.generatedAt)} / ${formatDuration(data.durationMs)}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="p-6 text-sm text-muted-foreground">読み込み中…</div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              <ModeBadge mode={data.mode} />
              <StatusBadge status={data.status} />
              {data.fiscalYear || data.endMonth ? (
                <Badge variant="outline" className="text-xs">
                  FY{data.fiscalYear ?? "—"}/{data.endMonth ?? "—"}月
                </Badge>
              ) : null}
            </div>

            {data.errorMessage && (
              <DetailSection title="エラー">
                <pre className="whitespace-pre-wrap break-words rounded border border-[var(--color-error)]/30 bg-[#fce4ec] p-2 text-xs text-[var(--color-error)]">
                  {data.errorMessage}
                </pre>
              </DetailSection>
            )}

            <DetailSection title="入力">
              <JsonBlock value={data.input} />
            </DetailSection>

            <DetailSection title="出力">
              <JsonBlock value={data.output} />
            </DetailSection>

            {Array.isArray(data.toolCalls) && data.toolCalls.length > 0 && (
              <DetailSection title={`tool_use (${data.toolCalls.length}件)`}>
                <JsonBlock value={data.toolCalls} />
              </DetailSection>
            )}

            <DetailSection title="メタ">
              <dl className="grid grid-cols-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">id</dt>
                <dd className="col-span-2 break-all">{data.id}</dd>
                <dt className="text-muted-foreground">userId</dt>
                <dd className="col-span-2 break-all">
                  {data.userId ?? "—"}
                </dd>
                <dt className="text-muted-foreground">createdAt</dt>
                <dd className="col-span-2">{formatDateTime(data.createdAt)}</dd>
              </dl>
            </DetailSection>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "text-[var(--color-success)]"
      : tone === "warn"
        ? "text-[#8d6e00]"
        : tone === "bad"
          ? "text-[var(--color-error)]"
          : "text-[var(--color-text-primary)]";
  return (
    <div className="rounded border bg-white p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold", toneCls)}>{value}</div>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="max-h-72 overflow-auto rounded border bg-muted/40 p-2 text-[11px] leading-relaxed">
      {text}
    </pre>
  );
}

function ModeBadge({ mode }: { mode: RunMode | null }) {
  if (!mode) return <span className="text-muted-foreground">—</span>;
  const cfg = {
    OBSERVE: { icon: Eye, cls: "border-gray-300 bg-gray-50 text-gray-600" },
    DIALOG: {
      icon: MessageSquare,
      cls: "border-blue-300 bg-blue-50 text-blue-700",
    },
    EXECUTE: {
      icon: Zap,
      cls: "border-amber-300 bg-amber-50 text-amber-700",
    },
    CRON: { icon: Play, cls: "border-purple-300 bg-purple-50 text-purple-700" },
  }[mode];
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", cfg.cls)}>
      <cfg.icon className="h-3 w-3" />
      {MODE_LABEL[mode]}
    </Badge>
  );
}

function StatusBadge({ status }: { status: RunStatus }) {
  const cfg = {
    SUCCESS: {
      icon: CheckCircle2,
      label: "成功",
      cls: "border-[var(--color-success)]/40 bg-[#e8f5e9] text-[var(--color-success)]",
    },
    FALLBACK: {
      icon: AlertTriangle,
      label: "フォールバック",
      cls: "border-[var(--color-warning)]/40 bg-[#fff4e5] text-[var(--color-warning)]",
    },
    FAILED: {
      icon: XCircle,
      label: "失敗",
      cls: "border-[var(--color-error)]/40 bg-[#fce4ec] text-[var(--color-error)]",
    },
  }[status];
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", cfg.cls)}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
