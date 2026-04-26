"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Info, ExternalLink } from "lucide-react";
import { useCurrentOrg } from "@/contexts/current-org";
import { useAuthStore } from "@/lib/auth";
import { usePeriodStore } from "@/lib/period-store";
import { api } from "@/lib/api";
import { useRunwayMode } from "@/components/ui/runway-mode-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ActionizeButton } from "@/components/ui/actionize-button";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

const severityStyle: Record<
  Severity,
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

const severityToActionSeverity: Record<
  Severity,
  "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "LOW",
};

export function SentinelCard() {
  const orgId = useCurrentOrg().currentOrgId ?? "";
  const { fiscalYear, month } = usePeriodStore();
  const [runwayMode] = useRunwayMode();

  const { data, isLoading } = useQuery({
    queryKey: ["sentinel-signals", orgId, fiscalYear, month, runwayMode],
    queryFn: () =>
      api.sentinel.signals(orgId, { fiscalYear, endMonth: month, runwayMode }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          sentinel の検知
          {data?.detections.length ? (
            <Badge variant="outline" className="ml-1">
              {data.detections.length}件
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : !data || data.detections.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {data?.fallbackReason ?? "現時点で異常兆候は検知されていません。"}
          </div>
        ) : (
          <ul className="space-y-3">
            {data.detections.map((d) => {
              const s = severityStyle[d.severity];
              const Icon = s.icon;
              return (
                <li
                  key={d.id}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        s.bg,
                      )}
                    >
                      <Icon className={cn("h-4 w-4", s.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("border", s.text)}
                        >
                          {s.label}
                        </Badge>
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {d.title}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        {d.body}
                      </p>
                      <div className="mt-2 text-xs text-muted-foreground">
                        根拠: {d.evidence.source} /{" "}
                        確度: {d.evidence.confidence} / 前提:{" "}
                        {d.evidence.premise}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {d.linkHref ? (
                          <Link
                            href={d.linkHref}
                            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                          >
                            詳細を見る
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : null}
                        <ActionizeButton
                          sourceScreen="CASHFLOW"
                          sourceRef={{ sentinelId: d.id, kind: d.kind }}
                          defaultTitle={d.title}
                          defaultDescription={d.body}
                          defaultSeverity={severityToActionSeverity[d.severity]}
                          defaultOwnerRole="EXECUTIVE"
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
