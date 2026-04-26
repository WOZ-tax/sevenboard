"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Info, ExternalLink } from "lucide-react";
import { useCurrentOrg } from "@/contexts/current-org";
import { useAuthStore } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

const categoryLabel: Record<string, string> = {
  COVERAGE_GAP: "対応漏れ",
  RECURRING_FINDING: "再発",
  RULE_DECAY: "ルール陳腐化",
  DATA_FRESHNESS: "データ鮮度",
};

export function AuditorCard() {
  const orgId = useCurrentOrg().currentOrgId ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["auditor-quality", orgId],
    queryFn: () => api.auditor.qualityCheck(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          auditor の品質チェック
          {data?.findings.length ? (
            <Badge variant="outline" className="ml-1">
              {data.findings.length}件
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
        ) : !data || data.findings.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {data?.fallbackReason ?? "品質上の指摘事項はありません。"}
          </div>
        ) : (
          <ul className="space-y-3">
            {data.findings.map((f) => {
              const s = severityStyle[f.severity];
              const Icon = s.icon;
              return (
                <li
                  key={f.id}
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
                        <Badge variant="outline" className="text-xs">
                          {categoryLabel[f.category] ?? f.category}
                        </Badge>
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {f.title}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        {f.body}
                      </p>
                      <div className="mt-2 text-xs text-muted-foreground">
                        根拠: {f.evidence.source} /{" "}
                        確度: {f.evidence.confidence} / 前提:{" "}
                        {f.evidence.premise}
                      </div>
                      {f.linkHref ? (
                        <div className="mt-2">
                          <Link
                            href={f.linkHref}
                            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                          >
                            対応画面を開く
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      ) : null}
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
