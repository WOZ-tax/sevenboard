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
import { formatYen, getValueColor } from "@/lib/format";
import { FileText, FlaskConical } from "lucide-react";
import { PrintButton } from "@/components/ui/print-button";
import { PeriodSegmentControl } from "@/components/ui/period-segment-control";
import { useMfPL, useMfBS, useMfCashflow, useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { api } from "@/lib/api";
import type { LinkedStatementsInput, LinkedStatementsResult } from "@/lib/api-types";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";

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
  rows: { category: string; current: number; prior?: number; isTotal?: boolean; isHeader?: boolean }[];
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

            const prior = row.prior ?? 0;
            const variance = row.current - prior;

            return (
              <TableRow key={index} className={cn(row.isTotal && "bg-muted/50 font-semibold")}>
                <TableCell className={cn("text-sm", row.isTotal && "font-bold text-[var(--color-text-primary)]")}>
                  {row.category}
                </TableCell>
                <TableCell className="text-right text-sm">{fmt(row.current)}</TableCell>
                <TableCell className="text-right text-sm">{fmt(prior)}</TableCell>
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

/**
 * CF 専用の月別推移テーブル。N 列（月別）を横展開する。
 *  - balance 行（前月繰越 / 期末残高）はその月の残高を表示
 *  - flow 行（売上回収 / 仕入支払 等）は各月の単月値を表示
 *  - header 行は category だけを colSpan で見出し表示
 *  - totals 行は太字＋背景色
 *
 * 「当期 vs 前期」の擬似 2 列比較は実務的に使い物にならないので採用しない。
 */
function CashflowMonthlyTable({
  rows,
  monthLabels,
  unit = "yen",
}: {
  rows: {
    category: string;
    values: (number | null)[];
    isTotal?: boolean;
    isHeader?: boolean;
    isDiff?: boolean;
  }[];
  monthLabels: string[];
  unit?: UnitKey;
}) {
  const fmt = (v: number) => formatByUnit(v, unit);
  const totalCols = monthLabels.length + 1; // 勘定科目列含む
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
            <TableHead className="sticky left-0 z-10 bg-[var(--color-background)] w-48 font-semibold text-[var(--color-text-primary)]">
              勘定科目
            </TableHead>
            {monthLabels.map((label) => (
              <TableHead
                key={label}
                className="w-24 text-right font-semibold text-[var(--color-text-primary)]"
              >
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            if (row.isHeader) {
              return (
                <TableRow key={index} className="bg-muted/30">
                  <TableCell
                    colSpan={totalCols}
                    className="text-sm font-semibold text-[var(--color-text-primary)]"
                  >
                    {row.category}
                  </TableCell>
                </TableRow>
              );
            }
            return (
              <TableRow
                key={index}
                className={cn(row.isTotal && "bg-muted/50 font-semibold")}
              >
                <TableCell
                  className={cn(
                    "sticky left-0 z-10 bg-[var(--color-surface)] text-sm",
                    row.isTotal &&
                      "bg-muted/50 font-bold text-[var(--color-text-primary)]",
                  )}
                >
                  {row.category}
                </TableCell>
                {row.values.map((v, i) => (
                  <TableCell key={i} className="text-right text-sm">
                    {typeof v === "number" ? fmt(v) : "—"}
                  </TableCell>
                ))}
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
  const [simResult, setSimResult] = useState<LinkedStatementsResult | null>(null);

  const orgId = useScopedOrgId();

  const mfPL = useMfPL();
  const mfBS = useMfBS();
  const mfCF = useMfCashflow();
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);

  const effectivePlData = mfPL.data;
  const effectiveBsAssets = mfBS.data?.assets;
  const effectiveBsLiabilitiesEquity = mfBS.data?.liabilitiesEquity;
  const effectiveCfData = mfCF.data?.rows;
  const effectiveCfMonths = mfCF.data?.months ?? [];
  const hasError = mfPL.isError || mfBS.isError;
  const hasNoMfData = !mfPL.isLoading && !mfBS.isLoading && !hasError && !effectivePlData && !effectiveBsAssets;

  // シミュレーション実行
  const runSimulation = async () => {
    if (!orgId) return;
    setSimLoading(true);
    try {
      const params: LinkedStatementsInput = {};
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

  // ─────────────────────────────────────────────────────────
  // CF は本来「月別推移」または「期首→期末の区分別内訳」で見るもの。
  // 旧実装の「当期 / 前期」二列比較は擬似的すぎて BS と食い違う事故も出ていたため、
  // ここでは「期首〜選択月」または「選択月含む直近3ヶ月」の月別列に展開する。
  //  - balance 行（前月繰越 / 期末残高）はその月の残高をそのまま表示
  //  - flow 行（売上回収・仕入支払 等）は各月の単月値を表示（合計は取らない）
  //  - header 行は category だけ
  // ─────────────────────────────────────────────────────────
  type CfRangeMode = "ytd" | "trailing3";
  const [cfRangeMode, setCfRangeMode] = useState<CfRangeMode>("ytd");

  const monthNum = (label: string): number => {
    const m = label.match(/(\d+)月/);
    return m ? Number(m[1]) : 0;
  };

  const cfDisplay = (() => {
    if (!displayCfData) return null;
    const allMonths = simMode && simResult ? [] : effectiveCfMonths;
    if (allMonths.length === 0) {
      return null;
    }

    // 選択月の index を特定
    const lastIdx = month
      ? (() => {
          const idx = allMonths.findIndex((l) => monthNum(l) === month);
          return idx >= 0 ? idx : allMonths.length - 1;
        })()
      : allMonths.length - 1;

    const startIdx =
      cfRangeMode === "trailing3" ? Math.max(0, lastIdx - 2) : 0;

    const monthLabels = allMonths.slice(startIdx, lastIdx + 1);

    const rows = displayCfData.map((r) => ({
      category: r.category,
      values: (r.values ?? []).slice(startIdx, lastIdx + 1) as (number | null)[],
      isTotal: r.isTotal,
      isHeader: r.isHeader,
      isDiff: r.isDiff,
    }));

    return { monthLabels, rows };
  })();

  if (hasError && !simMode) {
    return (
      <DashboardShell>
        <div className="space-y-4">
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
        <div className="space-y-4">
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
      <div className="space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">財務諸表</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        <div className="flex items-center justify-between screen-only">
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

        <PeriodSegmentControl />

        {/* シミュレーション入力パネル */}
        {simMode && (
          <Card className="screen-only border-[var(--color-tertiary)]/50 bg-[var(--color-tertiary)]/5">
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
                {simResult && (() => {
                  const profitImpact = simResult.summary.profitImpact ?? simResult.summary.cashImpact;
                  const cashImpact = simResult.summary.cashImpact;
                  const fmt = (v: number) => `${v > 0 ? "+" : ""}${formatYen(v)}`;
                  return (
                    <div className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        純利益変動: <span className={cn(getValueColor(profitImpact))}>{fmt(profitImpact)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        現預金影響: <span className={cn(getValueColor(cashImpact))}>{fmt(cashImpact)}</span>
                      </span>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between screen-only">
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
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                  キャッシュフロー計算書（C/F）{simMode && simResult ? " - シミュレーション" : ""}
                </CardTitle>
                {/* 期間切替トグル */}
                <div
                  role="tablist"
                  aria-label="表示期間"
                  className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <button
                    role="tab"
                    type="button"
                    aria-selected={cfRangeMode === "ytd"}
                    onClick={() => setCfRangeMode("ytd")}
                    className={cn(
                      "h-8 px-3 text-xs transition-colors",
                      cfRangeMode === "ytd"
                        ? "bg-[var(--color-primary)] text-white"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    期首〜選択月
                  </button>
                  <button
                    role="tab"
                    type="button"
                    aria-selected={cfRangeMode === "trailing3"}
                    onClick={() => setCfRangeMode("trailing3")}
                    className={cn(
                      "h-8 px-3 text-xs transition-colors",
                      cfRangeMode === "trailing3"
                        ? "bg-[var(--color-primary)] text-white"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    直近3ヶ月
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {mfCF.isLoading ? (
                <TableSkeleton />
              ) : cfDisplay ? (
                <CashflowMonthlyTable
                  rows={cfDisplay.rows}
                  monthLabels={cfDisplay.monthLabels}
                  unit={unit}
                />
              ) : (
                <MfEmptyState title="CF データなし" />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
