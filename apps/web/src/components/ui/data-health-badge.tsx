"use client";

import Link from "next/link";
import { Activity, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Overall = "HEALTHY" | "DEGRADED" | "UNKNOWN";

const sourceLabels: Record<string, string> = {
  MF_CLOUD: "MFクラウド",
  KINTONE: "kintone",
  SLACK: "Slack",
  TAX_PLUGIN: "Tax",
  BOOKKEEPING_PLUGIN: "Bookkeeping",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "未同期";
  const now = new Date();
  const past = new Date(iso);
  const diffMs = now.getTime() - past.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return `${Math.max(mins, 1)}分前`;
  }
  if (hours < 24) return `${Math.floor(hours)}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

export function DataHealthBadge({ compact = false }: { compact?: boolean }) {
  const orgId = useScopedOrgId();

  const { data } = useQuery({
    queryKey: ["data-health", orgId],
    queryFn: () => api.dataHealth.getStatus(orgId),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const overall: Overall = data?.overall ?? "UNKNOWN";
  const { icon: Icon, label, color, bg } = overallConfig[overall];

  const tooltipContent = data ? (
    <div className="space-y-1 text-xs">
      {data.sources.map((s) => (
        <div key={s.source} className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", sourceDotColor(s.status))} />
          <span className="min-w-[84px]">
            {sourceLabels[s.source] ?? s.source}
          </span>
          <span className="text-muted-foreground">
            {formatRelative(s.lastSyncAt)}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <span className="text-xs">データ取得中...</span>
  );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href="/data-health"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted",
              bg,
              color,
            )}
          />
        }
      >
        <Icon className="h-3.5 w-3.5" />
        {!compact && <span>{label}</span>}
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}

const overallConfig: Record<
  Overall,
  { icon: typeof CheckCircle2; label: string; color: string; bg: string }
> = {
  HEALTHY: {
    icon: CheckCircle2,
    label: "データ正常",
    color: "text-[var(--color-success)] border-[var(--color-success)]/40",
    bg: "bg-[#e8f5e9]",
  },
  DEGRADED: {
    icon: AlertTriangle,
    label: "同期異常",
    color: "text-[var(--color-error)] border-[var(--color-error)]/40",
    bg: "bg-[#fce4ec]",
  },
  UNKNOWN: {
    icon: HelpCircle,
    label: "未連携",
    color: "text-muted-foreground border-muted-foreground/30",
    bg: "bg-muted/30",
  },
};

function sourceDotColor(status: string | null): string {
  switch (status) {
    case "SUCCESS":
      return "bg-[var(--color-success)]";
    case "PARTIAL":
      return "bg-[var(--color-warning)]";
    case "FAILED":
      return "bg-[var(--color-error)]";
    default:
      return "bg-gray-400";
  }
}

/** KPIカード・アラート行などの信頼性表示用ミニバッジ */
export function ReliabilityBadge({
  reliability,
  className,
}: {
  reliability: "CONFIRMED" | "ESTIMATED" | "NOT_CONNECTED";
  className?: string;
}) {
  const cfg = {
    CONFIRMED: {
      label: "確定",
      cls: "bg-[#e8f5e9] text-[var(--color-success)] border-[var(--color-success)]/30",
    },
    ESTIMATED: {
      label: "推定",
      cls: "bg-[#fff4e5] text-[var(--color-warning)] border-[var(--color-warning)]/30",
    },
    NOT_CONNECTED: {
      label: "未連携",
      cls: "bg-gray-100 text-gray-600 border-gray-300",
    },
  }[reliability];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
        cfg.cls,
        className,
      )}
    >
      <Activity className="mr-0.5 h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}
