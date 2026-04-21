"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Eye,
  AlertCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { usePeriodStore } from "@/lib/period-store";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";

type BriefSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

const severityToActionSeverity: Record<
  BriefSeverity,
  "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "LOW",
};

const severityStyle: Record<
  BriefSeverity,
  { icon: typeof AlertCircle; bg: string; text: string; label: string }
> = {
  CRITICAL: {
    icon: AlertCircle,
    bg: "bg-[#fce4ec]",
    text: "text-[var(--color-error)]",
    label: "緊急",
  },
  HIGH: {
    icon: AlertTriangle,
    bg: "bg-[#fff4e5]",
    text: "text-[var(--color-warning)]",
    label: "重要",
  },
  MEDIUM: {
    icon: AlertTriangle,
    bg: "bg-[#fff8e1]",
    text: "text-[#8d6e00]",
    label: "注意",
  },
  LOW: {
    icon: Info,
    bg: "bg-[#e1f5fe]",
    text: "text-[var(--color-info)]",
    label: "情報",
  },
  INFO: {
    icon: Info,
    bg: "bg-[#e1f5fe]",
    text: "text-[var(--color-info)]",
    label: "情報",
  },
};

export function BriefingCard() {
  const orgId = useAuthStore((s) => s.user?.orgId || "");
  const { fiscalYear, month } = usePeriodStore();
  const [showHistory, setShowHistory] = useState(false);
  const [openSnapshotId, setOpenSnapshotId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["briefing-today", orgId, fiscalYear, month],
    queryFn: () =>
      api.briefing.today(orgId, { fiscalYear, endMonth: month }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const history = useQuery({
    queryKey: ["briefing-history", orgId],
    queryFn: () => api.briefing.history(orgId, { limit: 14, days: 30 }),
    enabled: !!orgId && showHistory,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Card className="border-[var(--color-secondary)]/40 bg-gradient-to-br from-[#ede7f6]/40 via-white to-white">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
          <span className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-[var(--color-secondary)]" />
            今朝のサマリー
          </span>
          {data?.generatedAt && (
            <span className="text-xs font-normal text-muted-foreground">
              {new Date(data.generatedAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
          </div>
        ) : !data || data.headlines.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {data?.fallbackReason ?? "本日の注目点はありません。"}
          </p>
        ) : (
          <>
            {data.greeting && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {data.greeting}
              </p>
            )}
            <ol className="space-y-2">
              {data.headlines.map((h, i) => {
                const style = severityStyle[h.severity] ?? severityStyle.INFO;
                const Icon = style.icon;
                const seed = `サマリーの注目点${i + 1}「${h.title}」について、根拠・想定インパクト・推奨アクションを整理してください。本文: ${h.body}`;
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border border-transparent p-3",
                      style.bg,
                    )}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-bold text-[var(--color-text-primary)]">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className={cn("h-4 w-4 shrink-0", style.text)} />
                        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {h.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("border-0 px-1.5 py-0 text-[10px]", style.text)}
                        >
                          {style.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {h.body}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {h.linkHref && (
                          <Link
                            href={h.linkHref}
                            className="inline-flex items-center gap-1 text-xs text-[var(--color-info)] hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            詳細を開く
                          </Link>
                        )}
                        <CopilotOpenButton
                          agentKey="brief"
                          mode="dialog"
                          seed={seed}
                          size="xs"
                          label="深掘り"
                        />
                        <ActionizeButton
                          sourceScreen="DASHBOARD"
                          sourceRef={{
                            headlineIndex: i,
                            briefSource: h.source,
                            from: "briefing",
                          }}
                          defaultTitle={h.title}
                          defaultDescription={h.body}
                          defaultSeverity={severityToActionSeverity[h.severity]}
                          defaultOwnerRole="ADVISOR"
                          size="sm"
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {data.fallbackReason && (
              <p className="pt-1 text-[11px] text-muted-foreground/70">
                ※ {data.fallbackReason}
              </p>
            )}
          </>
        )}
        <div className="border-t border-[var(--color-secondary)]/20 pt-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[var(--color-text-primary)]"
          >
            <History className="h-3.5 w-3.5" />
            過去のサマリー履歴
            {showHistory ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {history.isLoading ? (
                <div className="space-y-1">
                  <div className="h-7 animate-pulse rounded bg-muted" />
                  <div className="h-7 animate-pulse rounded bg-muted" />
                </div>
              ) : !history.data || history.data.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  履歴はまだありません。
                </p>
              ) : (
                history.data.map((snap) => {
                  const isOpen = openSnapshotId === snap.id;
                  return (
                    <div
                      key={snap.id}
                      className="rounded border border-[var(--color-secondary)]/20 bg-white/60"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenSnapshotId(isOpen ? null : snap.id)
                        }
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                      >
                        <span className="text-xs text-[var(--color-text-primary)]">
                          {new Date(snap.generatedAt).toLocaleString("ja-JP", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {snap.urgentCount > 0 && (
                            <Badge
                              variant="outline"
                              className="border-0 bg-[#fce4ec] px-1.5 py-0 text-[10px] text-[var(--color-error)]"
                            >
                              緊急 {snap.urgentCount}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {snap.headlineCount}件
                          </span>
                          {isOpen ? (
                            <ChevronUp className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {isOpen && snap.headlines.length > 0 && (
                        <ol className="space-y-1 border-t border-[var(--color-secondary)]/15 px-2 py-2">
                          {snap.headlines.map((h, i) => (
                            <li key={i} className="text-xs">
                              <div className="font-semibold text-[var(--color-text-primary)]">
                                {h.title}
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {h.body}
                              </p>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
