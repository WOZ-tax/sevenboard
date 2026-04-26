"use client";

import { useState, useMemo } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bell, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useMfDashboard, useAlerts } from "@/hooks/use-mf-data";
import { ActionizeButton } from "@/components/ui/actionize-button";

type Severity = "critical" | "warning" | "info";
type FilterType = "all" | Severity;

interface AlertItem {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  date: string;
  resolved: boolean;
}

const severityConfig: Record<
  Severity,
  { icon: typeof AlertCircle; color: string; badgeColor: string; label: string }
> = {
  critical: {
    icon: AlertCircle,
    color: "text-[var(--color-error)]",
    badgeColor: "bg-[#fce4ec] text-[var(--color-error)] border-red-300",
    label: "重要",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-[#f9a825]",
    badgeColor: "bg-[#fff8e1] text-[#8d6e00] border-amber-300",
    label: "注意",
  },
  info: {
    icon: Info,
    color: "text-[var(--color-info)]",
    badgeColor: "bg-[#e1f5fe] text-[var(--color-info)] border-blue-300",
    label: "情報",
  },
};


const filterButtons: { key: FilterType; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "critical", label: "重要" },
  { key: "warning", label: "注意" },
  { key: "info", label: "情報" },
];

export default function AlertsPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const dashboard = useMfDashboard();
  const apiAlerts = useAlerts();

  // APIデータが取れたらそれを使い、取れなければダッシュボード実績から算出可能なアラートだけを動的生成
  const allAlerts = useMemo(() => {
    // APIアラートがある場合はそちらを使う
    if (apiAlerts.data && apiAlerts.data.length > 0) {
      return apiAlerts.data.map((a, i) => ({
        id: a.id || String(i),
        severity: a.severity as Severity,
        title: a.title,
        description: a.description,
        date: a.detectedAt ? a.detectedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        resolved: false,
      }));
    }

    // APIが空でもランウェイ警告だけは動的に出す（ダッシュボード実データベース）
    const base: AlertItem[] = [];
    if (dashboard.data && dashboard.data.runway < 999) {
      const runway = dashboard.data.runway;
      if (runway < 6) {
        base.push({
          id: "mf-runway-critical",
          severity: "critical" as Severity,
          title: "ランウェイアラート",
          description: `ランウェイが6ヶ月を下回りました（現在: ${runway}ヶ月）。早急な資金調達・コスト見直しが必要です。`,
          date: new Date().toISOString().slice(0, 10),
          resolved: false,
        });
      } else if (runway < 12) {
        base.push({
          id: "mf-runway-warning",
          severity: "warning" as Severity,
          title: "ランウェイアラート",
          description: `ランウェイが12ヶ月を下回りました（現在: ${runway}ヶ月）。資金計画の見直しを推奨します。`,
          date: new Date().toISOString().slice(0, 10),
          resolved: false,
        });
      }
    }
    return base;
  }, [apiAlerts.data, dashboard.data]);

  const filteredAlerts =
    filter === "all"
      ? allAlerts
      : allAlerts.filter((a) => a.severity === filter);

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              アラート一覧
            </h1>
            <p className="text-sm text-muted-foreground">
              システムアラートの一覧と対応状況
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {filterButtons.map((btn) => (
            <Button
              key={btn.key}
              variant={filter === btn.key ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-9 text-xs",
                filter === btn.key &&
                  "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
              )}
              onClick={() => setFilter(btn.key)}
            >
              {btn.label}
            </Button>
          ))}
        </div>

        {filteredAlerts.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {apiAlerts.isLoading
                ? "アラートを読み込み中..."
                : "現在アラートはありません。"}
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;
            const sevMap: Record<
              Severity,
              "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
            > = { critical: "CRITICAL", warning: "HIGH", info: "MEDIUM" };

            return (
              <Card key={alert.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Icon
                        className={cn("mt-0.5 h-5 w-5 shrink-0", config.color)}
                      />
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {alert.title}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {alert.description}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {alert.date}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge
                        className={cn("border px-2 py-0.5", config.badgeColor)}
                      >
                        {config.label}
                      </Badge>
                      <Badge
                        className={cn(
                          "border px-2 py-0.5",
                          alert.resolved
                            ? "bg-[#e8f5e9] text-[var(--color-success)] border-green-300"
                            : "bg-gray-100 text-gray-700 border-gray-300"
                        )}
                      >
                        {alert.resolved ? "対応済み" : "未対応"}
                      </Badge>
                      {!alert.resolved && (
                        <ActionizeButton
                          sourceScreen="ALERTS"
                          sourceRef={{
                            alertId: alert.id,
                            severity: alert.severity,
                          }}
                          defaultTitle={alert.title}
                          defaultDescription={alert.description}
                          defaultSeverity={sevMap[alert.severity]}
                          defaultOwnerRole="ADVISOR"
                          size="sm"
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
