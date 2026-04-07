"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CashflowTable, type CertaintyLevel } from "@/components/cashflow/cashflow-table";
import { CashflowChart } from "@/components/cashflow/cashflow-chart";
import { Shield, Link2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatManYen } from "@/lib/format";
import { useMfCashflow } from "@/hooks/use-mf-data";

const mockRunwayData = {
  months: 18.5,
  alertLevel: "SAFE" as const,
  cashBalance: 17800,
  monthlyBurnRate: 960,
};

const alertLevelConfig = {
  SAFE: {
    color: "bg-green-100 text-green-700 border-green-300",
    dot: "bg-green-500",
    label: "安全",
  },
  CAUTION: {
    color: "bg-yellow-100 text-yellow-700 border-yellow-300",
    dot: "bg-yellow-500",
    label: "警戒",
  },
  WARNING: {
    color: "bg-orange-100 text-orange-700 border-orange-300",
    dot: "bg-orange-500",
    label: "注意",
  },
  CRITICAL: {
    color: "bg-red-100 text-red-700 border-red-300",
    dot: "bg-red-500",
    label: "危険",
  },
};

export default function CashflowPage() {
  const mfCashflow = useMfCashflow();

  // MFデータが取れたらランウェイを上書き、エラー時はモックにフォールバック
  const runwayData = mfCashflow.data?.runway
    ? {
        months: mfCashflow.data.runway.months ?? mockRunwayData.months,
        alertLevel: mfCashflow.data.runway.alertLevel ?? mockRunwayData.alertLevel,
        cashBalance: mfCashflow.data.runway.cashBalance ?? mockRunwayData.cashBalance,
        monthlyBurnRate: mfCashflow.data.runway.monthlyBurnRate ?? mockRunwayData.monthlyBurnRate,
      }
    : mockRunwayData;

  const config = alertLevelConfig[runwayData.alertLevel as keyof typeof alertLevelConfig];

  // MFデータが取れている場合、売上系をconfirmedに上書き
  const certaintyLevels: Record<string, CertaintyLevel> | undefined = mfCashflow.data
    ? {
        売上回収: "confirmed",
        売上入金: "confirmed",
        人件費: "planned",
        家賃: "planned",
        借入返済: "planned",
        "その他経費": "estimated",
        "その他支出": "estimated",
        設備投資: "estimated",
        法人税等: "estimated",
      }
    : undefined;

  const isLoading = mfCashflow.isLoading;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            資金繰り
          </h1>
          <p className="text-sm text-muted-foreground">
            2026年1月-6月 資金繰り表（編集可）
          </p>
        </div>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : (
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Shield className="h-10 w-10 text-[var(--color-text-primary)]" />
                  <div>
                    <div className="text-sm text-muted-foreground">
                      ランウェイ（想定月数）
                    </div>
                    <div className="text-3xl font-bold text-[var(--color-text-primary)] font-[family-name:var(--font-inter)]">
                      {runwayData.months.toFixed(1)}
                      <span className="ml-1 text-base font-normal text-muted-foreground">
                        か月
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={cn("border px-3 py-1 text-sm", config.color)}>
                    <span
                      className={cn("mr-2 inline-block h-2 w-2 rounded-full", config.dot)}
                    />
                    {config.label}
                  </Badge>
                  <div className="space-y-0.5 text-right text-xs text-muted-foreground">
                    <div>現預金残高: {formatManYen(runwayData.cashBalance)}</div>
                    <div>月次バーンレート: {formatManYen(runwayData.monthlyBurnRate)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                {mfCashflow.data ? (
                  <>
                    <span className="flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      MFクラウド連携
                    </span>
                    <span>最終取得: {new Date().toLocaleString("ja-JP")}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1">
                    <PenLine className="h-3 w-3" />
                    サンプルデータ表示中
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              月次資金繰り表
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : (
              <CashflowTable
                months={mfCashflow.data?.months}
                rows={mfCashflow.data?.rows}
                certaintyLevels={certaintyLevels}
              />
            )}
          </CardContent>
        </Card>

        <CashflowChart
          months={mfCashflow.data?.months}
          cashBalances={mfCashflow.data?.cashBalances}
        />
      </div>
    </DashboardShell>
  );
}
