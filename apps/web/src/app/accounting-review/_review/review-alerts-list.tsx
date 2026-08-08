"use client";

/**
 * 指摘一覧 (alerts ベース) — legacy / tbreview 両モード共通の表示。
 *
 * page.tsx の ReviewTab から切り出したもので、マークアップは切り出し前と同一。
 * tbreview ネイティブ表示でも「指摘一覧」ピルはこの見た目のまま使う。
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { cn } from "@/lib/utils";
import type { ReviewAlert } from "@/lib/mf-types";

export const SEVERITY_CONFIG = {
  HIGH: { label: "HIGH", color: "bg-red-100 text-red-800 border-red-300" },
  MEDIUM: { label: "MEDIUM", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  LOW: { label: "LOW", color: "bg-blue-100 text-blue-800 border-blue-300" },
};

const SEVERITY_TO_ACTION: Record<string, "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"> = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

export function ReviewAlertsList({ alerts }: { alerts: ReviewAlert[] | undefined }) {
  return (
    <Card><CardContent className="divide-y p-0">
      {(alerts || []).length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">指摘事項はありません</div>
      ) : (alerts ?? []).map((alert: ReviewAlert, i: number) => {
        const config = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.LOW;
        return (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <Badge className={cn("mt-0.5 shrink-0 border text-[10px]", config.color)}>{config.label}</Badge>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{alert.category}</span>
                <span className="text-sm font-medium">{alert.title}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</p>
            </div>
            <ActionizeButton
              sourceScreen="MONTHLY_REVIEW"
              sourceRef={{ alertIndex: i, category: alert.category, kind: "review-alert" }}
              defaultTitle={alert.title}
              defaultDescription={alert.detail}
              defaultSeverity={SEVERITY_TO_ACTION[alert.severity] ?? "MEDIUM"}
              defaultOwnerRole="ADVISOR"
              size="sm"
            />
          </div>
        );
      })}
    </CardContent></Card>
  );
}
