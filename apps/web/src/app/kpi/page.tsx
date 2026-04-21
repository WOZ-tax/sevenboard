"use client";

import { useMemo } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatManYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Target,
  DollarSign,
  BarChart3,
  Users,
  Repeat,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { useMfDashboard, useMfPL, useMfBS, useMfOffice } from "@/hooks/use-mf-data";
import type { DashboardSummary, FinancialStatementRow } from "@/lib/mf-types";
import { PrintButton } from "@/components/ui/print-button";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";

import { MfEmptyState } from "@/components/ui/mf-empty-state";

type KpiFormat = "manyen" | "percent" | "number" | "yen";

interface KpiCardData {
  title: string;
  value: number;
  prior?: number;
  icon: typeof DollarSign;
  format: KpiFormat;
  higherIsBetter: boolean;
}

function findRow(rows: FinancialStatementRow[] | undefined, category: string): FinancialStatementRow | undefined {
  if (!rows) return undefined;
  return rows.find((r) => r.category === category);
}

function findRowContains(rows: FinancialStatementRow[] | undefined, needle: string): FinancialStatementRow | undefined {
  if (!rows) return undefined;
  return rows.find((r) => r.category.includes(needle));
}

function buildKpiCards(
  data: DashboardSummary,
  plRows: FinancialStatementRow[] | undefined,
  bsAssets: FinancialStatementRow[] | undefined,
): KpiCardData[] {
  const revenue = data.revenue ?? 0;
  const opProfit = data.operatingProfit ?? 0;
  const cashBalance = data.cashBalance ?? 0;
  const totalAssets = data.totalAssets ?? 0;
  const netIncome = data.netIncome ?? 0;
  const opMargin = revenue > 0 ? Math.round((opProfit / revenue) * 1000) / 10 : 0;
  const roa = totalAssets > 0 ? Math.round((netIncome / totalAssets) * 1000) / 10 : 0;

  const priorRevenue = findRow(plRows, "売上高")?.prior;
  const priorOpProfit = findRow(plRows, "営業利益")?.prior;
  const priorNetIncome = findRow(plRows, "当期純利益")?.prior;
  const priorTotalAssets = findRow(bsAssets, "資産合計")?.prior;
  const priorCash = findRowContains(bsAssets, "現金")?.prior;

  const priorOpMargin =
    priorRevenue && priorRevenue > 0 && priorOpProfit !== undefined
      ? Math.round((priorOpProfit / priorRevenue) * 1000) / 10
      : undefined;
  const priorRoa =
    priorTotalAssets && priorTotalAssets > 0 && priorNetIncome !== undefined
      ? Math.round((priorNetIncome / priorTotalAssets) * 1000) / 10
      : undefined;

  return [
    { title: "売上高", value: revenue, prior: priorRevenue, icon: DollarSign, format: "yen", higherIsBetter: true },
    { title: "営業利益", value: opProfit, prior: priorOpProfit, icon: BarChart3, format: "yen", higherIsBetter: true },
    { title: "営業利益率", value: opMargin, prior: priorOpMargin, icon: Target, format: "percent", higherIsBetter: true },
    { title: "現預金残高", value: cashBalance, prior: priorCash, icon: DollarSign, format: "yen", higherIsBetter: true },
    { title: "総資産", value: totalAssets, prior: priorTotalAssets, icon: Repeat, format: "yen", higherIsBetter: true },
    { title: "ROA", value: roa, prior: priorRoa, icon: Users, format: "percent", higherIsBetter: true },
  ];
}

function formatKpiValue(value: number, format: KpiFormat): string {
  if (format === "manyen") return formatManYen(value);
  if (format === "yen") return `¥${value.toLocaleString()}`;
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

function formatDelta(current: number, prior: number, format: KpiFormat): string {
  const diff = current - prior;
  const sign = diff > 0 ? "+" : "";
  if (format === "percent") return `${sign}${diff.toFixed(1)}pt`;
  if (format === "yen") return `${sign}${formatManYen(diff)}`;
  return `${sign}${diff.toLocaleString()}`;
}

function YoyBadge({
  current,
  prior,
  format,
  higherIsBetter,
}: {
  current: number;
  prior: number | undefined;
  format: KpiFormat;
  higherIsBetter: boolean;
}) {
  if (prior === undefined || prior === null) {
    return <span className="text-xs text-muted-foreground">前期比 —</span>;
  }
  if (prior === 0) {
    return <span className="text-xs text-muted-foreground">前期比 —</span>;
  }
  const diff = current - prior;
  const ratio = Math.abs(prior) > 0 ? (diff / Math.abs(prior)) * 100 : 0;
  const isPositive = diff > 0;
  const isFlat = diff === 0;
  const isGood = isFlat ? null : higherIsBetter ? isPositive : !isPositive;
  const Icon = isFlat ? Minus : isPositive ? TrendingUp : TrendingDown;
  const color =
    isGood === null
      ? "text-muted-foreground"
      : isGood
        ? "text-green-600"
        : "text-red-600";
  return (
    <div className={cn("flex items-center gap-1 text-xs", color)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">
        {isPositive ? "+" : ""}
        {ratio.toFixed(1)}%
      </span>
      <span className="text-muted-foreground">
        （{formatDelta(current, prior, format)}）
      </span>
    </div>
  );
}

export default function KpiPage() {
  const dashboard = useMfDashboard();
  const mfPL = useMfPL();
  const mfBS = useMfBS();
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);

  const effectiveKpiCards = useMemo(() => {
    if (!dashboard.data) return null;
    return buildKpiCards(dashboard.data, mfPL.data, mfBS.data?.assets);
  }, [dashboard.data, mfPL.data, mfBS.data]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">KPIトラッキング</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        <div className="flex items-center justify-between screen-only">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              KPIトラッキング
            </h1>
            <p className="text-sm text-muted-foreground">
              重要指標モニタリング（前期比較付き）
            </p>
          </div>
          {effectiveKpiCards && <PrintButton />}
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
                  <CardContent className="space-y-2">
                    <div className="font-[family-name:var(--font-inter)] text-2xl font-bold text-[var(--color-text-primary)]">
                      {formatKpiValue(kpi.value, kpi.format)}
                    </div>
                    <YoyBadge
                      current={kpi.value}
                      prior={kpi.prior}
                      format={kpi.format}
                      higherIsBetter={kpi.higherIsBetter}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="screen-only">
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
