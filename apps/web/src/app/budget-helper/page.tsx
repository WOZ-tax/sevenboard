"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { useRunwayMode } from "@/components/ui/runway-mode-toggle";
import {
  Calculator,
  Bot,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";

interface Scenario {
  name: string;
  description: string;
  revenue: number;
  operatingProfit: number;
  assumptions: string[];
}

const scenarioStyle: Record<string, { badge: string; border?: string }> = {
  Base: { badge: "bg-[var(--color-primary)] text-white", border: "border-l-4 border-l-[var(--color-primary)]" },
  Upside: { badge: "bg-green-600 text-white" },
  Downside: { badge: "bg-red-600 text-white" },
};

function formatManYen(value: number): string {
  return `\u00A5${Math.round(value / 10000).toLocaleString()}万`;
}

// --- パラメータ入力 ---
interface ScenarioParams {
  baseGrowthRate: number;
  upsideGrowthRate: number;
  downsideGrowthRate: number;
  newHires: number;
  costReductionRate: number;
  notes: string;
}

const defaultParams: ScenarioParams = {
  baseGrowthRate: 5,
  upsideGrowthRate: 20,
  downsideGrowthRate: -5,
  newHires: 2,
  costReductionRate: 0,
  notes: "",
};

function ParamInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "%",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[var(--color-text-primary)]">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            min={min}
            max={max}
            step={step}
            className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-xs"
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full accent-[var(--color-primary)]"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const style = scenarioStyle[scenario.name] || scenarioStyle.Base;
  return (
    <Card className={cn(style.border)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Badge className={cn("px-2 py-0.5 text-xs", style.badge)}>{scenario.name}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{scenario.description}</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">売上予測</span>
            <span className="text-lg font-bold text-[var(--color-text-primary)]">{formatManYen(scenario.revenue)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">営業利益予測</span>
            <span className="text-lg font-bold text-[var(--color-text-primary)]">{formatManYen(scenario.operatingProfit)}</span>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-[var(--color-text-primary)]">前提条件</p>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            {scenario.assumptions.map((a, i) => (<li key={i}>{a}</li>))}
          </ul>
        </div>
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => alert("予算入力画面に反映予定")}>
          この予算を採用
        </Button>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2"><div className="h-6 w-24 rounded bg-muted" /></CardHeader>
      <CardContent className="space-y-3">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-8 w-1/2 rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

export default function BudgetHelperPage() {
  const orgId = useScopedOrgId();
  const [runwayMode] = useRunwayMode();

  const [params, setParams] = useState<ScenarioParams>(defaultParams);
  const [showParams, setShowParams] = useState(true);
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // POST版（パラメータ付き生成）
  const generateMutation = useMutation({
    mutationFn: () => api.ai.generateBudgetScenarios(orgId, {
      baseGrowthRate: params.baseGrowthRate,
      upsideGrowthRate: params.upsideGrowthRate,
      downsideGrowthRate: params.downsideGrowthRate,
      newHires: params.newHires,
      costReductionRate: params.costReductionRate,
      notes: params.notes || undefined,
      runwayMode,
    }),
    onSuccess: (data) => {
      if (data?.length) {
        setScenarios(data);
        setGenerateError(null);
      } else {
        setScenarios(null);
        setGenerateError("シナリオを生成できませんでした。入力条件を変えて再試行してください。");
      }
    },
    onError: () => {
      setScenarios(null);
      setGenerateError("生成中にエラーが発生しました。時間を置いて再試行してください。");
    },
  });

  const isGenerating = generateMutation.isPending;

  const handleGenerate = () => {
    if (!orgId) {
      setGenerateError("事業所が選択されていません。");
      return;
    }
    setGenerateError(null);
    generateMutation.mutate();
  };

  const handleReset = () => {
    setParams(defaultParams);
  };

  const updateParam = <K extends keyof ScenarioParams>(key: K, value: ScenarioParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Calculator className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">予算策定ヘルパー</h1>
            <p className="text-sm text-muted-foreground">パラメータを調整してAIにシナリオを提案させる</p>
          </div>
        </div>

        {/* パラメータ入力パネル */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
              <span className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                シナリオパラメータ
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleReset}>
                  <RotateCcw className="h-3 w-3" />
                  リセット
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowParams(!showParams)}>
                  {showParams ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          {showParams && (
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <ParamInput label="Base 売上成長率" value={params.baseGrowthRate} onChange={(v) => updateParam("baseGrowthRate", v)} min={-50} max={100} />
                <ParamInput label="Upside 売上成長率" value={params.upsideGrowthRate} onChange={(v) => updateParam("upsideGrowthRate", v)} min={0} max={200} />
                <ParamInput label="Downside 売上成長率" value={params.downsideGrowthRate} onChange={(v) => updateParam("downsideGrowthRate", v)} min={-80} max={20} />
                <ParamInput label="採用予定人数" value={params.newHires} onChange={(v) => updateParam("newHires", v)} min={0} max={50} unit="名" />
                <ParamInput label="コスト削減率" value={params.costReductionRate} onChange={(v) => updateParam("costReductionRate", v)} min={0} max={50} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-primary)]">補足メモ（AIへの追加指示）</label>
                <textarea
                  value={params.notes}
                  onChange={(e) => updateParam("notes", e.target.value)}
                  placeholder="例: 来期は新規事業の立ち上げがある、主要顧客の契約更新が不透明 等"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-muted-foreground/50"
                  rows={2}
                />
              </div>

              <Button
                className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <Calculator className={cn("h-4 w-4", isGenerating && "animate-spin")} />
                {isGenerating ? "シナリオ生成中..." : "シナリオを生成"}
              </Button>
            </CardContent>
          )}
        </Card>

        {/* ローディング */}
        {isGenerating && !scenarios && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 animate-pulse text-[var(--color-tertiary)]" />
              <p className="text-sm font-medium text-[var(--color-text-primary)]">パラメータに基づいてシナリオを生成中...</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        )}

        {/* エラー */}
        {generateError && !isGenerating && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="p-4 text-sm text-red-700">
              {generateError}
            </CardContent>
          </Card>
        )}

        {/* 生成結果 */}
        {scenarios && (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              {scenarios.map((scenario, index) => (
                <ScenarioCard key={index} scenario={scenario} />
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <Calculator className={cn("h-4 w-4", isGenerating && "animate-spin")} />
                {isGenerating ? "生成中..." : "シナリオを再生成"}
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
