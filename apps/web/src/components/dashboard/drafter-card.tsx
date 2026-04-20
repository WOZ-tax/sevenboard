"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { usePeriodStore } from "@/lib/period-store";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";

export function DrafterCard() {
  const orgId = useAuthStore((s) => s.user?.orgId || "");
  const { fiscalYear, month } = usePeriodStore();

  const { data, isLoading } = useQuery({
    queryKey: ["drafter-monthly", orgId, fiscalYear, month],
    queryFn: () =>
      api.drafter.monthlyDraft(orgId, { fiscalYear, endMonth: month }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <FileText className="h-4 w-4" />
              月次レポート初稿
              <Badge
                variant="outline"
                className="border-[var(--color-warning)] text-[var(--color-warning)]"
              >
                DRAFT
              </Badge>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              drafter が試算表から生成した初稿です。顧問による編集・最終責任を前提とします。
            </p>
          </div>
          <CopilotOpenButton
            agentKey="drafter"
            mode="dialog"
            seed="この月次レポート初稿について、もっと深掘りすべき論点や追加で触れるべき事項を提案してください。"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">
            生成できませんでした。
          </div>
        ) : (
          <div className="space-y-4">
            {data.fallbackReason ? (
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {data.fallbackReason}
              </div>
            ) : null}
            {data.sections.map((s, i) => (
              <section
                key={`${s.heading}-${i}`}
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {i + 1}. {s.heading}
                  </h3>
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                  {s.body}
                </p>
                <div className="mt-2 text-xs text-muted-foreground">
                  根拠: {s.evidence.source} /{" "}
                  確度: {s.evidence.confidence} / 前提: {s.evidence.premise}
                </div>
              </section>
            ))}
            <div className="pt-1 text-[11px] text-muted-foreground">
              生成: {new Date(data.generatedAt).toLocaleString("ja-JP")} — このドラフトは確定版ではありません。
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
