"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatManYen, getValueColor } from "@/lib/format";
import { FileText, FlaskConical } from "lucide-react";
import { PrintButton } from "@/components/ui/print-button";
import { useMfPL, useMfBS, useMfCashflow, useMfOffice } from "@/hooks/use-mf-data";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

type UnitKey = "yen" | "thousand" | "million";
type TabKey = "pl" | "bs" | "cf";

const units: { key: UnitKey; label: string }[] = [
  { key: "yen", label: "円" },
  { key: "thousand", label: "千円" },
  { key: "million", label: "百万円" },
];

function formatByUnit(value: number, unit: UnitKey): string {
  switch (unit) {
    case "thousand":
      return `${Math.round(value / 1000).toLocaleString()}千円`;
    case "million":
      return `${(value / 1000000).toFixed(1)}百万円`;
    default:
      return `¥${value.toLocaleString()}`;
  }
}

const tabs: { key: TabKey; label: string }[] = [
  { key: "pl", label: "P/L" },
  { key: "bs", label: "B/S" },
  { key: "cf", label: "C/F" },
];

import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";

function FinancialTable({
  rows,
  periodLabels,
  unit = "yen",
}: {
  rows: { category: string; current: number; prior: number; isTotal?: boolean; isHeader?: boolean }[];
  periodLabels: [string, string];
  unit?: UnitKey;
}) {
  const fmt = (v: number) => formatByUnit(v, unit);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
            <TableHead className="w-56 font-semibold text-[var(--color-text-primary)]">勘定科目</TableHead>
            <TableHead className="w-32 text-right font-semibold text-[var(--color-text-primary)]">{periodLabels[0]}</TableHead>
            <TableHead className="w-32 text-right font-semibold text-[var(--color-text-primary)]">{periodLabels[1]}</TableHead>
            <TableHead className="w-32 text-right font-semibold text-[var(--color-text-primary)]">増減額</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            if (row.isHeader) {
              return (
                <TableRow key={index} className="bg-muted/30">
                  <TableCell colSpan={4} className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {row.category}
                  </TableCell>
                </TableRow>
              );
            }

            const variance = row.current - row.prior;

            return (
              <TableRow key={index} className={cn(row.isTotal && "bg-muted/50 font-semibold")}>
                <TableCell className={cn("text-sm", row.isTotal && "font-bold text-[var(--color-text-primary)]")}>
                  {row.category}
                </TableCell>
                <TableCell className="text-right text-sm">{fmt(row.current)}</TableCell>
                <TableCell className="text-right text-sm">{fmt(row.prior)}</TableCell>
                <TableCell className={cn("text-right text-sm", getValueColor(variance))}>
                  {variance > 0 ? "+" : ""}
                  {fmt(variance)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

export default function FinancialStatementsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("pl");
  const [unit, setUnit] = useState<UnitKey>("yen");
  const [simMode, setSimMode] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [revenueOverride, setRevenueOverride] = useState("");
  const [cogsOverride, setCogsOverride] = useState("");
  const [sgaOverride, setSgaOverride] = useState("");
  const [simResult, setSimResult] = useState<any>(null);

  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";

  const mfPL = useMfPL();
  const mfBS = useMfBS();
  const mfCF = useMfCashflow();
  const mfOffice = useMfOffice();
  const periodLabel = mfOffice.data?.accounting_periods?.[0]
    ? `${mfOffice.data.accounting_periods[0].fiscal_year}年${mfOffice.data.accounting_periods[0].end_month}月度`
    : "";

  const effectivePlData = mfPL.data;
  const effectiveBsAssets = mfBS.data?.assets;
  const effectiveBsLiabilitiesEquity = mfBS.data?.liabilitiesEquity;
  const effectiveCfData = mfCF.data?.rows;
  const hasError = mfPL.isError || mfBS.isError;
  const hasNoMfData = !mfPL.isLoading && !mfBS.isLoading && !hasError && !effectivePlData && !effectiveBsAssets;

  // シミュレーション実行
  const runSimulation = async () => {
    if (!orgId) return;
    setSimLoading(true);
    try {
      const params: any = {};
      if (revenueOverride) params.revenueOverride = Number(revenueOverride);
      if (cogsOverride) params.cogsOverride = Number(cogsOverride);
      if (sgaOverride) params.sgaOverride = Number(sgaOverride);
      const res = await api.simulation.linkedStatements(orgId, params);
      setSimResult(res);
    } catch (err) {
      console.error("Linked statements simulation failed", err);
    } finally {
      setSimLoading(false);
    }
  };

  // シミュレーション結果があればそちらを優先表示
  const displayPlData = simMode && simResult ? simResult.pl : effectivePlData;
  const displayBsAssets = simMode && simResult ? simResult.bs.assets : effectiveBsAssets;
  const displayBsLE = simMode && simResult ? simResult.bs.liabilitiesEquity : effectiveBsLiabilitiesEquity;
  const displayCfData = simMode && simResult ? simResult.cf : effectiveCfData;

  if (hasError && !simMode) {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">財務諸表</h1>
            </div>
          </div>
          <QueryErrorState onRetry={() => { mfPL.refetch(); mfBS.refetch(); }} />
        </div>
      </DashboardShell>
    );
  }

  if (hasNoMfData && !simMode) {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">財務諸表</h1>
              <p className="text-sm text-muted-foreground">MFクラウド会計連携で表示されます</p>
            </div>
          </div>
          <MfEmptyState />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                財務諸表
              </h1>
              <p className="text-sm text-muted-foreground">
                {periodLabel ? `${periodLabel} 比較表示` : "比較表示"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton />
            <Button
              variant={simMode ? "default" : "outline"}
              size="sm"
              className={cn(
                "gap-2",
                simMode && "bg-[var(--color-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-tertiary)]/90"
              )}
              onClick={() => {
                setSimMode(!simMode);
                if (simMode) setSimResult(null);
              }}
            >
              <FlaskConical className="h-4 w-4" />
              {simMode ? "実績に戻す" : "シミュレーション"}
            </Button>
          </div>
        </div>

        {/* シミュレーション入力パネル */}
        {simMode && (
          <Card className="border-[var(--color-tertiary)]/50 bg-[var(--color-tertiary)]/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                <FlaskConical className="h-5 w-5 text-[var(--color-tertiary)]" />
                PLパラメータ変更
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">売上高</label>
                  <Input
                    type="number"
                    placeholder="上書き額（円）"
                    value={revenueOverride}
                    onChange={(e) => setRevenueOverride(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">売上原価</label>
                  <Input
                    type="number"
                    placeholder="上書き額（円）"
                    value={cogsOverride}
                    onChange={(e) => setCogsOverride(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">販管費</label>
                  <Input
                    type="number"
                    placeholder="上書き額（円）"
                    value={sgaOverride}
                    onChange={(e) => setSgaOverride(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <Button
                  size="sm"
                  className="bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                  onClick={runSimulation}
                  disabled={simLoading}
                >
                  {simLoading ? "計算中..." : "反映"}
                </Button>
                {simResult && (
                  <div className="flex gap-4 text-sm">
                    <span className="text-muted-foreground">
                      利益変動: <span className={cn(getValueColor(simResult.summary.cashImpact))}>{simResult.summary.cashImpact > 0 ? "+" : ""}{formatManYen(simResult.summary.cashImpact)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      現預金影響: <span className={cn(getValueColor(simResult.summary.cashImpact))}>{simResult.summary.cashImpact > 0 ? "+" : ""}{formatManYen(simResult.summary.cashImpact)}</span>
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div className="flex overflow-hidden rounded-md border border-input">
            {tabs.map((tab) => (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-9 rounded-none px-6 text-sm",
                  activeTab === tab.key && "bg-[var(--color-primary)] text-white"
                )}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-input">
            {units.map((u) => (
              <Button
                key={u.key}
                variant={unit === u.key ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-9 rounded-none px-4 text-xs",
                  unit === u.key && "bg-[var(--color-primary)] text-white"
                )}
                onClick={() => setUnit(u.key)}
              >
                {u.label}
              </Button>
            ))}
          </div>
        </div>

        {activeTab === "pl" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                損益計算書（P/L）{simMode && simResult ? " - シミュレーション" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mfPL.isLoading ? <TableSkeleton /> : displayPlData ? <FinancialTable rows={displayPlData} periodLabels={simMode && simResult ? ["シミュレーション", "実績"] : ["当期", "前期"]} unit={unit} /> : <MfEmptyState title="PL データなし" />}
            </CardContent>
          </Card>
        )}

        {activeTab === "bs" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                  貸借対照表（B/S）資産の部{simMode && simResult ? " - シミュレーション" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mfBS.isLoading ? <TableSkeleton /> : displayBsAssets ? <FinancialTable rows={displayBsAssets} periodLabels={simMode && simResult ? ["シミュレーション", "実績"] : ["当期", "前期"]} unit={unit} /> : <MfEmptyState title="BS データなし" />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                  貸借対照表（B/S）負債・純資産の部{simMode && simResult ? " - シミュレーション" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mfBS.isLoading ? <TableSkeleton /> : displayBsLE ? <FinancialTable rows={displayBsLE} periodLabels={simMode && simResult ? ["シミュレーション", "実績"] : ["当期", "前期"]} unit={unit} /> : <MfEmptyState title="BS データなし" />}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "cf" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                キャッシュフロー計算書（C/F）{simMode && simResult ? " - シミュレーション" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mfCF.isLoading ? <TableSkeleton /> : displayCfData ? <FinancialTable rows={displayCfData} periodLabels={simMode && simResult ? ["シミュレーション", "実績"] : ["当期", "前期"]} unit={unit} /> : <MfEmptyState title="CF データなし" />}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
