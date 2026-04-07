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
import { useMfPL, useMfBS, useMfCashflow } from "@/hooks/use-mf-data";
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

const plData = [
  { category: "売上高", current: 12500, prior: 11800 },
  { category: "売上原価", current: 7400, prior: 7100 },
  { category: "売上総利益", current: 5100, prior: 4700, isTotal: true },
  { category: "販管費", current: 2300, prior: 2100 },
  { category: "営業利益", current: 2800, prior: 2600, isTotal: true },
  { category: "営業外収益", current: 60, prior: 45 },
  { category: "営業外費用", current: 90, prior: 85 },
  { category: "経常利益", current: 2770, prior: 2560, isTotal: true },
];

const bsAssets = [
  { category: "【流動資産】", current: 0, prior: 0, isHeader: true },
  { category: "  現預金", current: 17800, prior: 16200 },
  { category: "  売掛金", current: 4200, prior: 3800 },
  { category: "  棚卸資産", current: 1500, prior: 1400 },
  { category: "流動資産合計", current: 23500, prior: 21400, isTotal: true },
  { category: "【固定資産】", current: 0, prior: 0, isHeader: true },
  { category: "  有形固定資産", current: 5200, prior: 5500 },
  { category: "  無形固定資産", current: 1800, prior: 2000 },
  { category: "固定資産合計", current: 7000, prior: 7500, isTotal: true },
  { category: "資産合計", current: 30500, prior: 28900, isTotal: true },
];

const bsLiabilitiesEquity = [
  { category: "【流動負債】", current: 0, prior: 0, isHeader: true },
  { category: "  買掛金", current: 3200, prior: 2900 },
  { category: "  短期借入金", current: 2000, prior: 2000 },
  { category: "流動負債合計", current: 5200, prior: 4900, isTotal: true },
  { category: "【固定負債】", current: 0, prior: 0, isHeader: true },
  { category: "  長期借入金", current: 8000, prior: 9000 },
  { category: "固定負債合計", current: 8000, prior: 9000, isTotal: true },
  { category: "負債合計", current: 13200, prior: 13900, isTotal: true },
  { category: "【純資産】", current: 0, prior: 0, isHeader: true },
  { category: "  資本金", current: 5000, prior: 5000 },
  { category: "  利益剰余金", current: 12300, prior: 10000 },
  { category: "純資産合計", current: 17300, prior: 15000, isTotal: true },
  { category: "負債純資産合計", current: 30500, prior: 28900, isTotal: true },
];

const cfData = [
  { category: "営業活動によるキャッシュフロー", current: 3200, prior: 2800, isTotal: true },
  { category: "投資活動によるキャッシュフロー", current: -800, prior: -1200, isTotal: true },
  { category: "財務活動によるキャッシュフロー", current: -800, prior: -500, isTotal: true },
  { category: "現預金増減額", current: 1600, prior: 1100, isTotal: true },
];

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

  const effectivePlData = mfPL.data ?? plData;
  const effectiveBsAssets = mfBS.data?.assets ?? bsAssets;
  const effectiveBsLiabilitiesEquity = mfBS.data?.liabilitiesEquity ?? bsLiabilitiesEquity;
  const effectiveCfData = mfCF.data?.rows ?? cfData;

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
                2026年3月度 比較表示
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
              {mfPL.isLoading ? <TableSkeleton /> : <FinancialTable rows={displayPlData} periodLabels={simMode && simResult ? ["シミュレーション", "実績"] : ["当期", "前期"]} unit={unit} />}
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
                {mfBS.isLoading ? <TableSkeleton /> : <FinancialTable rows={displayBsAssets} periodLabels={simMode && simResult ? ["シミュレーション", "実績"] : ["当期", "前期"]} unit={unit} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                  貸借対照表（B/S）負債・純資産の部{simMode && simResult ? " - シミュレーション" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mfBS.isLoading ? <TableSkeleton /> : <FinancialTable rows={displayBsLE} periodLabels={simMode && simResult ? ["シミュレーション", "実績"] : ["当期", "前期"]} unit={unit} />}
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
              {mfCF.isLoading ? <TableSkeleton /> : <FinancialTable rows={displayCfData} periodLabels={simMode && simResult ? ["シミュレーション", "実績"] : ["当期", "前期"]} unit={unit} />}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
