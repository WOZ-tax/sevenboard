"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentIdentity } from "@/lib/agent-voice";

interface AgentBannerProps {
  agent: AgentIdentity;
  /** 最終更新時刻 (ISO string) */
  lastUpdatedAt?: string | null;
  /** 検知件数。0件なら「検知なし」表示 */
  detectionCount?: number | null;
  /** 稼働状態 */
  status?: "idle" | "running" | "ok" | "alert" | "unknown";
  /** 右側にボタン等を追加したい場合 */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * 4画面のヘッダーに配置する共通バナー。
 * キャラ・アバター・顔アイコンは使わない。機能名と稼働状況のみ。
 */
export function AgentBanner({
  agent,
  lastUpdatedAt,
  detectionCount,
  status = "idle",
  actions,
  className,
}: AgentBannerProps) {
  const Icon = agent.icon;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
              {agent.roleName}
            </span>
            <StatusDot status={status} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{agent.summary}</span>
            {lastUpdatedAt && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatRelative(lastUpdatedAt)}
                </span>
              </>
            )}
            {typeof detectionCount === "number" && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <DetectionLabel count={detectionCount} />
              </>
            )}
          </div>
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

/* ---------- sub-components ---------- */

function StatusDot({
  status,
}: {
  status: "idle" | "running" | "ok" | "alert" | "unknown";
}) {
  const cfg: Record<typeof status, { label: string; cls: string }> = {
    idle: { label: "待機", cls: "bg-gray-300" },
    running: { label: "稼働中", cls: "bg-[var(--color-info)] animate-pulse" },
    ok: { label: "正常", cls: "bg-[var(--color-success)]" },
    alert: { label: "要確認", cls: "bg-[var(--color-warning)]" },
    unknown: { label: "未連携", cls: "bg-gray-300" },
  };
  const c = cfg[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
      title={c.label}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.cls)} />
      {c.label}
    </span>
  );
}

function DetectionLabel({ count }: { count: number }) {
  if (count <= 0) return <span>検知なし</span>;
  return (
    <span className="text-[var(--color-warning)]">検知 {count}件</span>
  );
}

function formatRelative(iso: string): string {
  const now = new Date();
  const past = new Date(iso);
  const diffMs = now.getTime() - past.getTime();
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}
