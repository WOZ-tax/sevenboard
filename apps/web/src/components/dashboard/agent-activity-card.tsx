"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Activity,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Eye,
  MessageSquare,
  Play,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { api } from "@/lib/api";

type AgentKey = "BRIEF" | "SENTINEL" | "DRAFTER" | "AUDITOR" | "COPILOT";
type RunMode = "OBSERVE" | "DIALOG" | "EXECUTE" | "CRON";
type RunStatus = "SUCCESS" | "FALLBACK" | "FAILED";

const AGENT_LABEL: Record<AgentKey, string> = {
  BRIEF: "サマリー",
  SENTINEL: "sentinel",
  DRAFTER: "drafter",
  AUDITOR: "auditor",
  COPILOT: "copilot",
};

function formatRelative(iso: string): string {
  const now = Date.now();
  const past = new Date(iso).getTime();
  const diffMin = Math.floor((now - past) / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

export function AgentActivityCard() {
  const orgId = useScopedOrgId();

  const { data } = useQuery({
    queryKey: ["agent-runs-recent", orgId],
    queryFn: () => api.agentRuns.list(orgId, { limit: 5, days: 7 }),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="inline-flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-[var(--color-tertiary)]" />
          最近のエージェント活動
        </CardTitle>
        <Link
          href="/agent-runs"
          className="inline-flex items-center text-xs text-muted-foreground hover:text-[var(--color-tertiary)]"
        >
          すべて表示
          <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            直近7日の実行なし
          </div>
        ) : (
          <ul className="divide-y text-xs">
            {items.map((run) => (
              <li
                key={run.id}
                className="flex items-center gap-2 py-2 first:pt-0 last:pb-0"
              >
                <ModeIcon mode={run.mode} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">
                      {AGENT_LABEL[run.agentKey]}
                    </span>
                    <StatusBadge status={run.status} />
                  </div>
                  <div className="truncate text-muted-foreground">
                    {run.errorMessage || `${formatRelative(run.generatedAt)} 実行`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ModeIcon({ mode }: { mode: RunMode | null }) {
  if (!mode) {
    return <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
  const Icon = {
    OBSERVE: Eye,
    DIALOG: MessageSquare,
    EXECUTE: Zap,
    CRON: Play,
  }[mode];
  const cls = {
    OBSERVE: "text-gray-500",
    DIALOG: "text-blue-600",
    EXECUTE: "text-amber-600",
    CRON: "text-purple-600",
  }[mode];
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", cls)} />;
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
      label: "FB",
      cls: "border-[var(--color-warning)]/40 bg-[#fff4e5] text-[var(--color-warning)]",
    },
    FAILED: {
      icon: XCircle,
      label: "失敗",
      cls: "border-[var(--color-error)]/40 bg-[#fce4ec] text-[var(--color-error)]",
    },
  }[status];
  return (
    <Badge
      variant="outline"
      className={cn("gap-0.5 px-1 py-0 text-[10px]", cfg.cls)}
    >
      <cfg.icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  );
}
