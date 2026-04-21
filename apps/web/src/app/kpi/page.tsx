"use client";

import { useMemo } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatManYen } from "@/lib/format";
import {
  Target,
  DollarSign,
  BarChart3,
  Users,
  Repeat,
} from "lucide-react";
import { useMfDashboard } from "@/hooks/use-mf-data";
import type { DashboardSummary } from "@/lib/mf-types";

import { MfEmptyState } from "@/components/ui/mf-empty-state";

type KpiFormat = "manyen" | "percent" | "number" | "yen";

interface KpiCardData {
  title: string;
  value: number;
  icon: typeof DollarSign;
  format: KpiFormat;
}

function buildKpiCards(data: DashboardSummary): KpiCardData[] {
  const revenue = data.revenue ?? 0;
  const opProfit = data.operatingProfit ?? 0;
  const cashBalance = data.cashBalance ?? 0;
  const totalAssets = data.totalAssets ?? 0;
  const netIncome = data.netIncome ?? 0;
  const opMargin = revenue > 0 ? Math.round((opProfit / revenue) * 1000) / 10 : 0;
  const roa = totalAssets > 0 ? Math.round((netIncome / totalAssets) * 1000) / 10 : 0;

  return [
    { title: "売上高", value: revenue, icon: DollarSign, format: "yen" },
    { title: "営業利益", value: opProfit, icon: BarChart3, format: "yen" },
    { title: "営業利益率", value: opMargin, icon: Target, format: "percent" },
    { title: "現預金残高", value: cashBalance, icon: DollarSign, format: "yen" },
    { title: "総資産", value: totalAssets, icon: Repeat, format: "yen" },
    { title: "ROA", value: roa, icon: Users, format: "percent" },
  ];
}

// MRR分析: SaaS固有指標のため、将来的にKPIマスタから取得する想定

function formatKpiValue(
  value: number,
  format: KpiFormat
): string {
  if (format === "manyen") return formatManYen(value);
  if (format === "yen") return `¥${value.toLocaleString()}`;
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

export default function KpiPage() {
  const dashboard = useMfDashboard();

  const effectiveKpiCards = useMemo(() => {
    if (!dashboard.data) return null;
    return buildKpiCards(dashboard.data);
  }, [dashboard.data]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            KPIトラッキング
          </h1>
          <p className="text-sm text-muted-foreground">
            重要指標モニタリング
          </p>
        </div>

        {dashboard.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !effectiveKpiCards ? (
          <MfEmptyState />
        ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {effectiveKpiCards.map((kpi) => {
            const Icon = kpi.icon;

            return (
              <Card key={kpi.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--color-tertiary)]" />
                      {kpi.title}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-[family-name:var(--font-inter)] text-2xl font-bold text-[var(--color-text-primary)]">
                    {formatKpiValue(kpi.value, kpi.format)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              MRR 分析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              SaaS KPIデータ（MRR/Churn等）は今後KPIマスタ機能で対応予定です
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
