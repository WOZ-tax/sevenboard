"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Gauge, Shield, TrendingUp, Zap } from "lucide-react";
import { useMfFinancialIndicators } from "@/hooks/use-mf-data";
import type { FinancialIndicators } from "@/lib/mf-types";

type IndicatorKey = keyof FinancialIndicators;

interface IndicatorDef {
  key: IndicatorKey;
  label: string;
  unit: string;
  good: number;
  caution: number;
  higherIsBetter: boolean;
  description: string;
}

const safetyIndicators: IndicatorDef[] = [
  { key: "currentRatio", label: "流動比率", unit: "%", good: 200, caution: 100, higherIsBetter: true, description: "流動資産 / 流動負債。短期支払い能力を示す" },
  { key: "equityRatio", label: "自己資本比率", unit: "%", good: 40, caution: 20, higherIsBetter: true, description: "純資産 / 総資産。財務基盤の安定性を示す" },
  { key: "debtEquityRatio", label: "負債比率", unit: "%", good: 100, caution: 200, higherIsBetter: false, description: "負債 / 純資産。低いほど財務的に健全" },
];

const profitIndicators: IndicatorDef[] = [
  { key: "grossProfitMargin", label: "売上総利益率", unit: "%", good: 40, caution: 20, higherIsBetter: true, description: "粗利益率。商品・サービスの収益力を示す" },
  { key: "operatingProfitMargin", label: "営業利益率", unit: "%", good: 10, caution: 3, higherIsBetter: true, description: "本業の収益力を示す" },
  { key: "roe", label: "ROE", unit: "%", good: 10, caution: 5, higherIsBetter: true, description: "純利益 / 純資産。株主資本の効率を示す" },
  { key: "roa", label: "ROA", unit: "%", good: 5, caution: 2, higherIsBetter: true, description: "純利益 / 総資産。資産全体の効率を示す" },
];

const efficiencyIndicators: IndicatorDef[] = [
  { key: "totalAssetTurnover", label: "総資産回転率", unit: "回", good: 1.0, caution: 0.5, higherIsBetter: true, description: "売上 / 総資産。資産の有効活用度を示す" },
  { key: "receivablesTurnover", label: "売上債権回転率", unit: "回", good: 6, caution: 4, higherIsBetter: true, description: "売上 / 売掛金。回収の効率を示す" },
];

function getJudgment(def: IndicatorDef, value: number): { label: string; color: string } {
  if (def.higherIsBetter) {
    if (value >= def.good) return { label: "良好", color: "bg-[#e8f5e9] text-[var(--color-success)] border-green-300" };
    if (value >= def.caution) return { label: "注意", color: "bg-[#fff8e1] text-[#8d6e00] border-amber-300" };
    return { label: "要改善", color: "bg-[#fce4ec] text-[var(--color-error)] border-red-300" };
  } else {
    if (value <= def.good) return { label: "良好", color: "bg-[#e8f5e9] text-[var(--color-success)] border-green-300" };
    if (value <= def.caution) return { label: "注意", color: "bg-[#fff8e1] text-[#8d6e00] border-amber-300" };
    return { label: "要改善", color: "bg-[#fce4ec] text-[var(--color-error)] border-red-300" };
  }
}

function getProgressPercent(def: IndicatorDef, value: number): number {
  if (def.higherIsBetter) {
    // good以上 → 100%, caution → 50%, 0 → 0%
    const max = def.good * 1.5;
    return Math.min(100, Math.max(0, (value / max) * 100));
  } else {
    // 0 → 100%, good → 66%, caution → 33%, 超過 → 低い
    const max = def.caution * 1.5;
    return Math.min(100, Math.max(0, ((max - value) / max) * 100));
  }
}

function getProgressColor(def: IndicatorDef, value: number): string {
  const judgment = getJudgment(def, value);
  if (judgment.label === "良好") return "bg-[var(--color-success)]";
  if (judgment.label === "注意") return "bg-[#f9a825]";
  return "bg-[var(--color-error)]";
}

import { MfEmptyState } from "@/components/ui/mf-empty-state";

function IndicatorCard({
  def,
  value,
}: {
  def: IndicatorDef;
  value: number;
}) {
  const judgment = getJudgment(def, value);
  const progress = getProgressPercent(def, value);
  const progressColor = getProgressColor(def, value);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-[var(--color-text-primary)]">
            {def.label}
          </div>
          <Badge className={cn("border text-xs", judgment.color)}>
            {judgment.label}
          </Badge>
        </div>
        <div className="text-2xl font-bold text-[var(--color-text-primary)]">
          {value.toFixed(1)}
          <span className="text-sm font-normal text-muted-foreground ml-1">
            {def.unit}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={cn("h-full rounded-full transition-all", progressColor)}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground">{def.description}</div>
      </CardContent>
    </Card>
  );
}

export default function IndicatorsPage() {
  const indicators = useMfFinancialIndicators();

  const data = indicators.data;

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* ヘッダー */}
        <div className="flex items-center gap-3">
          <Gauge className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              財務指標
            </h1>
            <p className="text-sm text-muted-foreground">
              主要な財務指標と判定結果
            </p>
          </div>
        </div>

        {indicators.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !data ? (
          <MfEmptyState />
        ) : (
        <>
        {/* 安全性 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              安全性
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {safetyIndicators.map((def) => (
              <IndicatorCard
                key={def.key}
                def={def}
                value={data[def.key] || 0}
              />
            ))}
          </div>
        </section>

        {/* 収益性 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              収益性
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {profitIndicators.map((def) => (
              <IndicatorCard
                key={def.key}
                def={def}
                value={data[def.key] || 0}
              />
            ))}
          </div>
        </section>

        {/* 効率性 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              効率性
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {efficiencyIndicators.map((def) => (
              <IndicatorCard
                key={def.key}
                def={def}
                value={data[def.key] || 0}
              />
            ))}
          </div>
        </section>
        </>
        )}
      </div>
    </DashboardShell>
  );
}
