"use client";

import { useState, useMemo } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bell, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useMfDashboard, useAlerts } from "@/hooks/use-mf-data";

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

const alertsData: AlertItem[] = [
  {
    id: "1",
    severity: "critical",
    title: "予算超過アラート",
    description:
      "営業費の3月度実績が予算を25%超過しています。原因分析と対策の確認が必要です。",
    date: "2026-04-05",
    resolved: false,
  },
  {
    id: "2",
    severity: "critical",
    title: "資金繰りアラート",
    description:
      "ランウェイが低下傾向です。資金調達計画の見直しを推奨します。",
    date: "2026-04-04",
    resolved: false,
  },
  {
    id: "3",
    severity: "warning",
    title: "売上構成比の偏り",
    description:
      "主要顧客A社の売上構成比が50%を超えています。依存リスクに注意してください。",
    date: "2026-04-03",
    resolved: false,
  },
  {
    id: "4",
    severity: "warning",
    title: "KPI未達アラート",
    description:
      "営業利益率が目標を12%下回り、実績は8.5%でした。",
    date: "2026-04-02",
    resolved: true,
  },
  {
    id: "5",
    severity: "info",
    title: "月次レポート生成完了",
    description:
      "2026年3月度の月次レポートが自動生成されました。内容をご確認ください。",
    date: "2026-04-01",
    resolved: true,
  },
  {
    id: "6",
    severity: "warning",
    title: "固定費増加の兆候",
    description:
      "直近四半期で固定費が前年同期比8%増加しています。費用項目の確認が必要です。",
    date: "2026-03-30",
    resolved: false,
  },
  {
    id: "7",
    severity: "info",
    title: "データ連携完了",
    description:
      "MoneyForward とのデータ同期が正常に完了しました。最終同期: 2026-04-05 09:00",
    date: "2026-04-05",
    resolved: true,
  },
  {
    id: "8",
    severity: "info",
    title: "新年度予算テンプレート",
    description:
      "2027年度の予算策定テンプレートが利用可能になりました。",
    date: "2026-03-28",
    resolved: true,
  },
];

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

  // APIデータが取れたらそれを使い、取れなければモック+ダッシュボードベースのアラートにフォールバック
  const allAlerts = useMemo(() => {
    // APIアラートがある場合はそちらを使う
    if (apiAlerts.data && apiAlerts.data.length > 0) {
      return apiAlerts.data.map((a: any, i: number) => ({
        id: a.id || String(i),
        severity: a.severity as Severity,
        title: a.title,
        description: a.description,
        date: a.detectedAt ? a.detectedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        resolved: false,
      }));
    }

    // フォールバック: モックデータ + ダッシュボードベースの動的アラート
    const base = [...alertsData];
    if (dashboard.data && dashboard.data.runway < 999) {
      const runway = dashboard.data.runway;
      if (runway < 6) {
        base.unshift({
          id: "mf-runway-critical",
          severity: "critical" as Severity,
          title: "ランウェイアラート",
          description: `ランウェイが6ヶ月を下回りました（現在: ${runway}ヶ月）。早急な資金調達・コスト見直しが必要です。`,
          date: new Date().toISOString().slice(0, 10),
          resolved: false,
        });
      } else if (runway < 12) {
        base.unshift({
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
      <div className="space-y-6">
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

        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;

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
